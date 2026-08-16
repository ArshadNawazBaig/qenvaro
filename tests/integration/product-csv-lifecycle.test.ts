import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PermissionError,
  resolvePermissions,
} from "@/modules/permissions/permissions";
import { ProductCsvService } from "@/modules/products/csv-service";
import {
  ProductCsvFeatureUnavailableError,
  ProductCsvImportConflictError,
  ProductCsvPreviewNotFoundError,
  ProductCsvValidationError,
} from "@/modules/products/csv-service";
import { ProductService } from "@/modules/products/service";
import { productListQuerySchema } from "@/modules/products/schemas";
import { TagService } from "@/modules/tags/service";
import type { TenantContext } from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringIdDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)("product CSV preview and import lifecycle", () => {
  const suffix = crypto.randomUUID();
  const tenantId = `org_csv_${suffix}`;
  const otherTenantId = `org_csv_other_${suffix}`;
  const storeId = `store_csv_${suffix}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;
  let productId: string;
  let tagId: string;

  const ownerContext: TenantContext = {
    tenantId,
    tenantSlug: `csv-${suffix}`,
    userId: `usr_csv_${suffix}`,
    sessionId: `session_csv_${suffix}`,
    membershipId: `member_csv_${suffix}`,
    roles: ["OWNER"],
    permissions: resolvePermissions(["OWNER"]),
    allowedStoreIds: new Set([storeId]),
    activeStoreId: storeId,
    requestId: `request_csv_${suffix}`,
  };

  const mapping = {
    name: "name",
    sku: "sku",
    subtitle: "subtitle",
    category: "category",
    price: "price",
    openingStock: "opening_stock",
    reorderLevel: "reorder_level",
    status: "status",
    tags: "tags",
  };

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringIdDocument>("tenantProfiles").insertMany([
      {
        _id: `profile_csv_${suffix}`,
        tenantId,
        slug: ownerContext.tenantSlug,
        businessName: "CSV Integration",
        currency: "USD",
        locale: "en-US",
        timezone: "UTC",
        planKey: "growth",
        billingStatus: "trialing",
        trialEndsAt: new Date(now.getTime() + 86_400_000),
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `profile_csv_other_${suffix}`,
        tenantId: otherTenantId,
        slug: `csv-other-${suffix}`,
        businessName: "Other CSV Integration",
        currency: "USD",
        locale: "en-US",
        timezone: "UTC",
        planKey: "growth",
        billingStatus: "trialing",
        trialEndsAt: new Date(now.getTime() + 86_400_000),
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.collection<StringIdDocument>("stores").insertOne({
      _id: storeId,
      tenantId,
      code: "MAIN",
      name: "Main Store",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    tagId = (
      await new TagService().create(ownerContext, {
        name: "Featured",
        description: "Featured catalog products.",
        color: "blue",
      })
    ).id;
    productId = (
      await new ProductService().createSimple(ownerContext, {
        name: "Existing Oxford",
        sku: `CSV-OLD-${suffix.slice(0, 6)}`,
        category: "Apparel",
        priceMinor: 7_900,
        openingStock: 7,
      })
    ).id;
  });

  afterAll(async () => {
    for (const collection of [
      "applicationRateLimits",
      "auditLogs",
      "categories",
      "importExportJobs",
      "inventoryLevels",
      "inventoryMovements",
      "productImportPreviews",
      "productVariants",
      "products",
      "stores",
      "tags",
      "tenantProfiles",
      "units",
    ])
      await database.collection(collection).deleteMany({
        tenantId: { $in: [tenantId, otherTenantId] },
      });
    await client.close();
  });

  it("previews, validates, and atomically creates and updates by SKU", async () => {
    const service = new ProductCsvService();
    const existingSku = `CSV-OLD-${suffix.slice(0, 6)}`;
    const newSku = `CSV-NEW-${suffix.slice(0, 6)}`;
    const preview = await service.createPreview(
      ownerContext,
      [
        "name,sku,subtitle,category,price,opening_stock,reorder_level,status,tags",
        `Updated Oxford,${existingSku},Updated by import,Apparel,99.50,999,4,draft,Featured`,
        `Everyday Cap,${newSku},New imported item,Accessories,25.00,6,2,active,Featured`,
      ].join("\n"),
    );
    expect(preview).toMatchObject({ rowCount: 2, version: 1 });
    expect(preview.suggestedMapping).toEqual(mapping);

    const validation = await service.validatePreview(ownerContext, {
      previewId: preview.previewId,
      expectedVersion: preview.version,
      mapping,
      duplicateSkuBehavior: "update",
    });
    expect(validation).toMatchObject({
      version: 2,
      totalRows: 2,
      validRows: 2,
      createCount: 1,
      updateCount: 1,
      skipCount: 0,
      issues: [],
    });
    expect(validation.warnings).toEqual([
      expect.objectContaining({ rowNumber: 2 }),
    ]);

    const movementsBefore = await database
      .collection("inventoryMovements")
      .countDocuments({ tenantId, variantId: `${productId}_default` });
    const imported = await service.commitImport(ownerContext, {
      previewId: preview.previewId,
      expectedVersion: validation.version,
    });
    const repeated = await service.commitImport(ownerContext, {
      previewId: preview.previewId,
      expectedVersion: validation.version,
    });
    const [existing, created, existingLevel, createdLevel, job, audit] =
      await Promise.all([
        database.collection<StringIdDocument>("products").findOne({
          _id: productId,
          tenantId,
        }),
        database.collection<StringIdDocument>("products").findOne({
          tenantId,
          normalizedSku: newSku.toUpperCase(),
        }),
        database.collection<StringIdDocument>("inventoryLevels").findOne({
          tenantId,
          variantId: `${productId}_default`,
        }),
        database.collection<StringIdDocument>("inventoryLevels").findOne({
          tenantId,
          variantId: { $ne: `${productId}_default` },
          quantity: 6,
        }),
        database.collection<StringIdDocument>("importExportJobs").findOne({
          _id: preview.previewId,
          tenantId,
        }),
        database.collection<StringIdDocument>("auditLogs").findOne({
          tenantId,
          entityId: preview.previewId,
          action: "product.csv_import.completed",
        }),
      ]);

    expect(imported).toEqual({
      previewId: preview.previewId,
      createdCount: 1,
      updatedCount: 1,
      skippedCount: 0,
      alreadyImported: false,
    });
    expect(repeated).toEqual({ ...imported, alreadyImported: true });
    expect(existing).toMatchObject({
      name: "Updated Oxford",
      subtitle: "Updated by import",
      priceMinor: 9_950,
      stock: 7,
      reorderLevel: 4,
      status: "draft",
      tagIds: [tagId],
      version: 2,
    });
    expect(created).toMatchObject({
      name: "Everyday Cap",
      category: "Accessories",
      stock: 6,
      priceMinor: 2_500,
      tagIds: [tagId],
      version: 1,
    });
    expect(created?.unitId).toBe(existing?.unitId);
    expect(created?.unitId).toBeTruthy();
    expect(existingLevel).toMatchObject({ quantity: 7, version: 1 });
    expect(createdLevel).toMatchObject({ quantity: 6, version: 1 });
    await expect(
      database.collection("inventoryMovements").countDocuments({
        tenantId,
        variantId: `${productId}_default`,
      }),
    ).resolves.toBe(movementsBefore);
    expect(job).toMatchObject({
      status: "completed",
      rowCount: 2,
      createdCount: 1,
      updatedCount: 1,
      skippedCount: 0,
    });
    expect(audit).toMatchObject({ actorId: ownerContext.userId });
  });

  it("returns row-level errors and blocks invalid commits", async () => {
    const service = new ProductCsvService();
    const now = new Date();
    await database.collection<StringIdDocument>("categories").insertOne({
      _id: `cat_csv_archived_${suffix}`,
      tenantId,
      name: "Retired Goods",
      normalizedName: "retired goods",
      slug: `retired-goods-${suffix}`,
      description: "Archived import boundary fixture.",
      status: "archived",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const preview = await service.createPreview(
      ownerContext,
      [
        "name,sku,subtitle,category,price,opening_stock,reorder_level,status,tags",
        "Bad product,DUP-CSV,,Apparel,nope,0,0,archived,Missing tag",
        "Duplicate,DUP-CSV,,Apparel,10.00,0,0,active,",
        "Retired product,RETIRED-CSV,,Retired Goods,10.00,0,0,active,",
      ].join("\n"),
    );
    const validation = await service.validatePreview(ownerContext, {
      previewId: preview.previewId,
      expectedVersion: 1,
      mapping,
      duplicateSkuBehavior: "update",
    });
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rowNumber: 2, field: "price" }),
        expect.objectContaining({ rowNumber: 2, field: "status" }),
        expect.objectContaining({ rowNumber: 2, field: "tags" }),
        expect.objectContaining({ rowNumber: 2, field: "sku" }),
        expect.objectContaining({ rowNumber: 3, field: "sku" }),
        expect.objectContaining({ rowNumber: 4, field: "category" }),
      ]),
    );
    await expect(
      service.commitImport(ownerContext, {
        previewId: preview.previewId,
        expectedVersion: validation.version,
      }),
    ).rejects.toBeInstanceOf(ProductCsvValidationError);
  });

  it("applies the selected behavior when a SKU already exists", async () => {
    const service = new ProductCsvService();
    const sku = `CSV-OLD-${suffix.slice(0, 6)}`;
    const csv = [
      "name,sku,subtitle,category,price,opening_stock,reorder_level,status,tags",
      `Ignored update,${sku},Would change,Apparel,1.00,0,0,active,Featured`,
    ].join("\n");
    const rejectedPreview = await service.createPreview(ownerContext, csv);
    const rejected = await service.validatePreview(ownerContext, {
      previewId: rejectedPreview.previewId,
      expectedVersion: 1,
      mapping,
      duplicateSkuBehavior: "reject",
    });
    expect(rejected.issues).toContainEqual(
      expect.objectContaining({ rowNumber: 2, field: "sku" }),
    );

    const skippedPreview = await service.createPreview(ownerContext, csv);
    const skipped = await service.validatePreview(ownerContext, {
      previewId: skippedPreview.previewId,
      expectedVersion: 1,
      mapping,
      duplicateSkuBehavior: "skip",
    });
    expect(skipped).toMatchObject({
      validRows: 1,
      createCount: 0,
      updateCount: 0,
      skipCount: 1,
      issues: [],
    });
    const before = await database
      .collection<StringIdDocument>("products")
      .findOne({ _id: productId, tenantId });
    const result = await service.commitImport(ownerContext, {
      previewId: skippedPreview.previewId,
      expectedVersion: skipped.version,
    });
    const after = await database
      .collection<StringIdDocument>("products")
      .findOne({ _id: productId, tenantId });
    expect(result).toMatchObject({
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 1,
    });
    expect(after?.version).toBe(before?.version);
    expect(after?.name).toBe(before?.name);
  });

  it("rejects cross-tenant previews and catalog changes after validation", async () => {
    const service = new ProductCsvService();
    const sku = `CSV-OLD-${suffix.slice(0, 6)}`;
    const preview = await service.createPreview(
      ownerContext,
      [
        "name,sku,subtitle,category,price,opening_stock,reorder_level,status,tags",
        `Concurrent Oxford,${sku},Before conflict,Apparel,101.00,0,3,active,Featured`,
      ].join("\n"),
    );
    await expect(
      service.validatePreview(
        {
          ...ownerContext,
          tenantId: otherTenantId,
          tenantSlug: `csv-other-${suffix}`,
        },
        {
          previewId: preview.previewId,
          expectedVersion: 1,
          mapping,
          duplicateSkuBehavior: "update",
        },
      ),
    ).rejects.toBeInstanceOf(ProductCsvPreviewNotFoundError);
    const validation = await service.validatePreview(ownerContext, {
      previewId: preview.previewId,
      expectedVersion: 1,
      mapping,
      duplicateSkuBehavior: "update",
    });
    await new ProductService().update(ownerContext, {
      productId,
      expectedVersion: 2,
      name: "Changed after validation",
      subtitle: "Concurrent catalog edit",
      sku,
      category: "Apparel",
      priceMinor: 10_100,
      reorderLevel: 3,
      status: "active",
      tagIds: [tagId],
    });
    await expect(
      service.commitImport(ownerContext, {
        previewId: preview.previewId,
        expectedVersion: validation.version,
      }),
    ).rejects.toBeInstanceOf(ProductCsvImportConflictError);
  });

  it("exports filtered rows with spreadsheet formula protection", async () => {
    await new ProductService().update(ownerContext, {
      productId,
      expectedVersion: 3,
      name: "=FORMULA PRODUCT",
      subtitle: "+FORMULA SUBTITLE",
      sku: `CSV-OLD-${suffix.slice(0, 6)}`,
      category: "Apparel",
      priceMinor: 10_100,
      reorderLevel: 3,
      status: "active",
      tagIds: [tagId],
    });
    const exported = await new ProductCsvService().export(
      ownerContext,
      productListQuerySchema.parse({ q: "FORMULA" }),
    );
    expect(exported.rowCount).toBe(1);
    expect(exported.csv).toContain("'=FORMULA PRODUCT");
    expect(exported.csv).toContain("'+FORMULA SUBTITLE");
    await expect(
      database.collection("importExportJobs").countDocuments({
        tenantId,
        type: "product_csv_export",
      }),
    ).resolves.toBe(1);
  });

  it("enforces import and export permissions before touching catalog data", async () => {
    const viewerContext: TenantContext = {
      ...ownerContext,
      roles: ["VIEWER"],
      permissions: resolvePermissions(["VIEWER"]),
    };
    const service = new ProductCsvService();
    await expect(
      service.createPreview(
        viewerContext,
        "name,sku,category,price\nViewer row,VIEW-1,Apparel,10.00",
      ),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(
      service.export(viewerContext, productListQuerySchema.parse({})),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("enforces the plan feature independently of permissions", async () => {
    await database
      .collection("tenantProfiles")
      .updateOne({ tenantId }, { $set: { planKey: "starter" } });
    await expect(
      new ProductCsvService().createPreview(
        ownerContext,
        "name,sku,category,price\nStarter row,START-1,Apparel,10.00",
      ),
    ).rejects.toBeInstanceOf(ProductCsvFeatureUnavailableError);
  });
});
