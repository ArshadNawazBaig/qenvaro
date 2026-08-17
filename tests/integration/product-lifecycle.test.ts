import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PermissionError,
  resolvePermissions,
} from "@/modules/permissions/permissions";
import {
  ProductNotFoundError,
  ProductService,
  ProductVersionConflictError,
} from "@/modules/products/service";
import { productListQuerySchema } from "@/modules/products/schemas";
import { ProductRepository } from "@/server/repositories/products";
import type { TenantContext } from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringIdDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)("product lifecycle transaction", () => {
  const suffix = crypto.randomUUID();
  const tenantId = `org_product_${suffix}`;
  const otherTenantId = `org_product_other_${suffix}`;
  const storeId = `store_product_${suffix}`;
  const otherStoreId = `store_product_other_${suffix}`;
  const storeRestrictedProductId = `prd_store_restricted_${suffix}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;
  let productId: string;
  let multiStoreProductId: string;

  const ownerContext: TenantContext = {
    tenantId,
    tenantSlug: `product-${suffix}`,
    userId: `usr_product_${suffix}`,
    sessionId: `session_product_${suffix}`,
    membershipId: `member_product_${suffix}`,
    roles: ["OWNER"],
    permissions: resolvePermissions(["OWNER"]),
    allowedStoreIds: new Set([storeId]),
    activeStoreId: storeId,
    requestId: `request_product_${suffix}`,
  };

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringIdDocument>("tenantProfiles").insertOne({
      _id: `profile_${suffix}`,
      tenantId,
      slug: ownerContext.tenantSlug,
      businessName: "Product Integration",
      currency: "USD",
      locale: "en-US",
      timezone: "UTC",
      planKey: "growth",
      billingStatus: "trialing",
      trialEndsAt: new Date(now.getTime() + 86_400_000),
      operationSettings: { defaultTaxRateBps: 1_250 },
      createdAt: now,
      updatedAt: now,
    });
    await database.collection<StringIdDocument>("stores").insertOne({
      _id: storeId,
      tenantId,
      code: "MAIN",
      name: "Main Store",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await database.collection<StringIdDocument>("stores").insertOne({
      _id: otherStoreId,
      tenantId,
      code: "OTHER",
      name: "Other Store",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    productId = (
      await new ProductService().createSimple(ownerContext, {
        name: "Counter Kit",
        sku: `CK-${suffix.slice(0, 8)}`,
        category: "Hardware",
        priceMinor: 89_000,
        openingStock: 7,
      })
    ).id;
    multiStoreProductId = (
      await new ProductService().createSimple(
        {
          ...ownerContext,
          allowedStoreIds: new Set([storeId, otherStoreId]),
        },
        {
          name: "Multi Store Product",
          sku: `MULTI-${suffix.slice(0, 8)}`,
          category: "Hardware",
          priceMinor: 5_000,
          openingStock: 5,
          reorderLevel: 6,
        },
      )
    ).id;
    await Promise.all([
      database.collection<StringIdDocument>("inventoryLevels").insertOne({
        _id: `level_multi_other_${suffix}`,
        tenantId,
        storeId: otherStoreId,
        variantId: `${multiStoreProductId}_default`,
        quantity: 7,
        version: 1,
        createdAt: now,
        updatedAt: now,
        updatedBy: ownerContext.userId,
      }),
      database
        .collection<StringIdDocument>("products")
        .updateOne(
          { _id: multiStoreProductId, tenantId },
          { $set: { stock: 12, revenueMinor: 999_999 } },
        ),
      database
        .collection<StringIdDocument>("products")
        .updateOne(
          { _id: productId, tenantId },
          { $set: { revenueMinor: 2_000_000 } },
        ),
      database.collection<StringIdDocument>("sales").insertMany([
        {
          _id: `sale_multi_main_${suffix}`,
          tenantId,
          storeId,
          status: "completed",
          idempotencyKey: `sale-multi-main-${suffix}`,
          totalMinor: 1_000,
          lines: [{ productId: multiStoreProductId, lineTotalMinor: 1_000 }],
          createdAt: now,
        },
        {
          _id: `sale_multi_other_${suffix}`,
          tenantId,
          storeId: otherStoreId,
          status: "completed",
          idempotencyKey: `sale-multi-other-${suffix}`,
          totalMinor: 2_000,
          lines: [{ productId: multiStoreProductId, lineTotalMinor: 2_000 }],
          createdAt: now,
        },
      ]),
    ]);
    await database.collection<StringIdDocument>("products").insertOne({
      _id: storeRestrictedProductId,
      tenantId,
      name: "Other Store Product",
      subtitle: "Restricted catalog item",
      sku: `OTHER-${suffix.slice(0, 8)}`,
      normalizedSku: `OTHER-${suffix.slice(0, 8)}`,
      slug: `other-store-product-${suffix}`,
      priceMinor: 1_500,
      currency: "USD",
      stock: 2,
      reorderLevel: 1,
      category: "Hardware",
      status: "active",
      views: 0,
      revenueMinor: 0,
      imageTone: "slate",
      allowedStoreIds: [otherStoreId],
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: ownerContext.userId,
      updatedBy: ownerContext.userId,
    });
  });

  afterAll(async () => {
    for (const collection of [
      "auditLogs",
      "categories",
      "inventoryLevels",
      "inventoryMovements",
      "productVariants",
      "products",
      "returns",
      "sales",
      "stores",
      "tenantProfiles",
      "units",
    ])
      await database.collection(collection).deleteMany({ tenantId });
    await client.close();
  });

  it("returns detail only through the owning tenant and authorized store", async () => {
    const repository = new ProductRepository();
    const detail = await repository.detail(ownerContext, productId);
    const crossTenant = await repository.detail(
      {
        ...ownerContext,
        tenantId: otherTenantId,
        tenantSlug: "other-product-tenant",
      },
      productId,
    );

    expect(detail).toMatchObject({
      id: productId,
      name: "Counter Kit",
      stock: 7,
      version: 1,
      inventory: [
        {
          storeId,
          storeName: "Main Store",
          storeCode: "MAIN",
          quantity: 7,
        },
      ],
    });
    expect(detail?.variants).toHaveLength(1);
    expect(crossTenant).toBeNull();
    await expect(
      database
        .collection<StringIdDocument>("products")
        .findOne(
          { _id: productId, tenantId },
          { projection: { taxRateBps: 1 } },
        ),
    ).resolves.toMatchObject({ taxRateBps: 1_250 });
  });

  it("enforces assigned-store scope for lists, details, filters, and mutations", async () => {
    const repository = new ProductRepository();
    const allQuery = productListQuerySchema.parse({});
    const restrictedList = await repository.list(ownerContext, allQuery);
    const restrictedDetail = await repository.detail(
      ownerContext,
      storeRestrictedProductId,
    );
    const restrictedStores = await repository.storeOptions(ownerContext);
    const bothStoresContext: TenantContext = {
      ...ownerContext,
      allowedStoreIds: new Set([storeId, otherStoreId]),
    };
    const otherStoreList = await repository.list(
      bothStoresContext,
      productListQuerySchema.parse({ store: otherStoreId }),
    );
    const mainStoreProduct = await repository.list(
      bothStoresContext,
      productListQuerySchema.parse({
        q: "Multi Store Product",
        store: storeId,
        stock: "low",
      }),
    );
    const otherStoreProduct = await repository.list(
      bothStoresContext,
      productListQuerySchema.parse({
        q: "Multi Store Product",
        store: otherStoreId,
      }),
    );
    const revenueSorted = await repository.list(
      ownerContext,
      productListQuerySchema.parse({
        sort: "revenue",
        direction: "desc",
      }),
    );
    const [restrictedMultiStoreDetail, allStoreMultiStoreDetail] =
      await Promise.all([
        repository.detail(ownerContext, multiStoreProductId),
        repository.detail(bothStoresContext, multiStoreProductId),
      ]);
    const [restrictedMetrics, allStoreMetrics] = await Promise.all([
      repository.metrics(ownerContext),
      repository.metrics(bothStoresContext),
    ]);

    expect(
      restrictedList.items.some(
        (product) => product.id === storeRestrictedProductId,
      ),
    ).toBe(false);
    expect(restrictedDetail).toBeNull();
    expect(restrictedStores.map((store) => store.id)).toEqual([storeId]);
    expect(otherStoreList.items.map((product) => product.id)).toContain(
      storeRestrictedProductId,
    );
    expect(otherStoreList.items.map((product) => product.id)).not.toContain(
      productId,
    );
    expect(mainStoreProduct.items[0]).toMatchObject({
      id: multiStoreProductId,
      stock: 5,
      revenueMinor: 1_000,
    });
    expect(otherStoreProduct.items[0]).toMatchObject({
      id: multiStoreProductId,
      stock: 7,
      revenueMinor: 2_000,
    });
    expect(revenueSorted.items[0]).toMatchObject({
      id: multiStoreProductId,
      revenueMinor: 1_000,
    });
    expect(restrictedMultiStoreDetail?.revenueMinor).toBe(1_000);
    expect(allStoreMultiStoreDetail?.revenueMinor).toBe(3_000);
    expect(restrictedMetrics.revenueMinor).toBe(1_000);
    expect(allStoreMetrics.revenueMinor).toBe(3_000);
    await expect(
      new ProductService().update(ownerContext, {
        productId: storeRestrictedProductId,
        expectedVersion: 1,
        name: "Unauthorized store update",
        subtitle: "Must not persist",
        sku: `NO-STORE-${suffix.slice(0, 8)}`,
        category: "Hardware",
        priceMinor: 1,
        reorderLevel: 0,
        status: "active",
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it("updates product and default variant atomically and audits the change", async () => {
    const result = await new ProductService().update(ownerContext, {
      productId,
      expectedVersion: 1,
      name: "Counter Kit Pro",
      subtitle: "Updated retail hardware bundle",
      description: "A complete point-of-sale counter hardware bundle.",
      sku: `CK-PRO-${suffix.slice(0, 8)}`,
      barcode: `BC-${suffix.slice(0, 12)}`,
      category: "Hardware",
      priceMinor: 99_000,
      costMinor: 61_000,
      reorderLevel: 4,
      status: "draft",
    });
    const [product, variant, audit] = await Promise.all([
      database.collection<StringIdDocument>("products").findOne({
        _id: productId,
        tenantId,
      }),
      database.collection<StringIdDocument>("productVariants").findOne({
        _id: `${productId}_default`,
        tenantId,
      }),
      database.collection("auditLogs").findOne({
        tenantId,
        entityId: productId,
        action: "product.updated",
      }),
    ]);

    expect(result.version).toBe(2);
    expect(product).toMatchObject({
      name: "Counter Kit Pro",
      priceMinor: 99_000,
      costMinor: 61_000,
      description: "A complete point-of-sale counter hardware bundle.",
      barcode: `BC-${suffix.slice(0, 12)}`,
      stock: 7,
      status: "draft",
      version: 2,
    });
    expect(variant).toMatchObject({
      sku: `CK-PRO-${suffix.slice(0, 8)}`,
      priceMinor: 99_000,
      costMinor: 61_000,
      version: 2,
    });
    expect(audit).toMatchObject({
      actorId: ownerContext.userId,
      requestId: ownerContext.requestId,
    });
  });

  it("creates non-stock services without inventory ledger entries", async () => {
    const serviceId = (
      await new ProductService().createSimple(ownerContext, {
        name: "Installation service",
        subtitle: "On-site setup",
        description: "Installation and configuration at the customer site.",
        sku: `SERVICE-${suffix.slice(0, 8)}`,
        barcode: `SERVICE-BC-${suffix.slice(0, 8)}`,
        category: "Hardware",
        type: "service",
        priceMinor: 25_000,
        costMinor: 8_000,
        openingStock: 99,
        reorderLevel: 10,
        inventoryTracking: true,
        status: "draft",
      })
    ).id;
    const [detail, product, movementCount, levelCount] = await Promise.all([
      new ProductRepository().detail(ownerContext, serviceId),
      database.collection<StringIdDocument>("products").findOne({
        _id: serviceId,
        tenantId,
      }),
      database.collection("inventoryMovements").countDocuments({
        tenantId,
        productId: serviceId,
      }),
      database.collection("inventoryLevels").countDocuments({
        tenantId,
        variantId: `${serviceId}_default`,
      }),
    ]);

    expect(product).toMatchObject({
      type: "service",
      inventoryTracking: false,
      stock: null,
      costMinor: 8_000,
      status: "draft",
    });
    expect(detail).toMatchObject({
      id: serviceId,
      type: "service",
      inventoryTracking: false,
      stock: null,
      barcode: `SERVICE-BC-${suffix.slice(0, 8)}`,
    });
    expect(movementCount).toBe(0);
    expect(levelCount).toBe(0);
  });

  it("rejects stale and unauthorized updates", async () => {
    await expect(
      new ProductService().update(ownerContext, {
        productId,
        expectedVersion: 1,
        name: "Stale write",
        subtitle: "Should not persist",
        sku: `STALE-${suffix.slice(0, 8)}`,
        category: "Hardware",
        priceMinor: 1,
        reorderLevel: 0,
        status: "active",
      }),
    ).rejects.toBeInstanceOf(ProductVersionConflictError);

    await expect(
      new ProductService().update(
        {
          ...ownerContext,
          roles: ["VIEWER"],
          permissions: resolvePermissions(["VIEWER"]),
        },
        {
          productId,
          expectedVersion: 2,
          name: "Unauthorized write",
          subtitle: "Should not persist",
          sku: `NOPE-${suffix.slice(0, 8)}`,
          category: "Hardware",
          priceMinor: 1,
          reorderLevel: 0,
          status: "active",
        },
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("activates and archives authorized products in auditable bulk transactions", async () => {
    const service = new ProductService();
    const firstId = (
      await service.createSimple(ownerContext, {
        name: "Bulk First",
        sku: `BULK-A-${suffix.slice(0, 8)}`,
        category: "Hardware",
        priceMinor: 2_000,
        openingStock: 1,
      })
    ).id;
    const secondId = (
      await service.createSimple(ownerContext, {
        name: "Bulk Second",
        sku: `BULK-B-${suffix.slice(0, 8)}`,
        category: "Hardware",
        priceMinor: 3_000,
        openingStock: 1,
      })
    ).id;
    for (const [id, name, sku, priceMinor] of [
      [firstId, "Bulk First", `BULK-A-${suffix.slice(0, 8)}`, 2_000],
      [secondId, "Bulk Second", `BULK-B-${suffix.slice(0, 8)}`, 3_000],
    ] as const)
      await service.update(ownerContext, {
        productId: id,
        expectedVersion: 1,
        name,
        subtitle: "Bulk action test",
        sku,
        category: "Hardware",
        priceMinor,
        reorderLevel: 0,
        status: "draft",
      });

    await expect(
      service.bulkStatus(ownerContext, {
        productIds: [firstId, storeRestrictedProductId],
        status: "archived",
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
    await expect(
      service.bulkStatus(
        {
          ...ownerContext,
          roles: ["VIEWER"],
          permissions: resolvePermissions(["VIEWER"]),
        },
        { productIds: [firstId], status: "active" },
      ),
    ).rejects.toBeInstanceOf(PermissionError);

    await expect(
      service.bulkStatus(ownerContext, {
        productIds: [firstId, secondId, firstId],
        status: "active",
      }),
    ).resolves.toEqual({ updated: 2, unchanged: 0 });
    await expect(
      service.bulkStatus(ownerContext, {
        productIds: [firstId, secondId],
        status: "archived",
      }),
    ).resolves.toEqual({ updated: 2, unchanged: 0 });

    const [products, variants, audits] = await Promise.all([
      database
        .collection<StringIdDocument>("products")
        .find({ _id: { $in: [firstId, secondId] }, tenantId })
        .toArray(),
      database
        .collection<StringIdDocument>("productVariants")
        .find({ productId: { $in: [firstId, secondId] }, tenantId })
        .toArray(),
      database
        .collection<StringIdDocument>("auditLogs")
        .find({
          entityId: { $in: [firstId, secondId] },
          action: { $in: ["product.activated", "product.archived"] },
          tenantId,
        })
        .toArray(),
    ]);
    expect(products).toHaveLength(2);
    expect(products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "archived", version: 4 }),
        expect.objectContaining({ status: "archived", version: 4 }),
      ]),
    );
    expect(variants).toHaveLength(2);
    expect(variants.every((variant) => variant.productArchivedAt)).toBe(true);
    expect(audits).toHaveLength(4);
  });

  it("archives idempotently without changing inventory state", async () => {
    const levelsBefore = await database
      .collection("inventoryLevels")
      .find({ tenantId })
      .toArray();
    const movementsBefore = await database
      .collection("inventoryMovements")
      .find({ tenantId })
      .toArray();

    const first = await new ProductService().archive(ownerContext, {
      productId,
      expectedVersion: 2,
    });
    const second = await new ProductService().archive(ownerContext, {
      productId,
      expectedVersion: 2,
    });
    const [product, levelsAfter, movementsAfter, audit] = await Promise.all([
      database.collection<StringIdDocument>("products").findOne({
        _id: productId,
        tenantId,
      }),
      database.collection("inventoryLevels").find({ tenantId }).toArray(),
      database.collection("inventoryMovements").find({ tenantId }).toArray(),
      database.collection("auditLogs").findOne({
        tenantId,
        entityId: productId,
        action: "product.archived",
      }),
    ]);

    expect(first).toEqual({ version: 3, alreadyArchived: false });
    expect(second).toEqual({ version: 3, alreadyArchived: true });
    expect(product).toMatchObject({ status: "archived", stock: 7, version: 3 });
    expect(levelsAfter).toEqual(levelsBefore);
    expect(movementsAfter).toEqual(movementsBefore);
    expect(audit).toMatchObject({
      actorId: ownerContext.userId,
      requestId: ownerContext.requestId,
    });
  });
});
