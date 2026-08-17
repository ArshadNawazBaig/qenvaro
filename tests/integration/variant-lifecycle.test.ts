import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PermissionError,
  resolvePermissions,
} from "@/modules/permissions/permissions";
import { ProductService } from "@/modules/products/service";
import {
  DefaultVariantImmutableError,
  OptionConfigurationLockedError,
  OptionGroupDuplicateError,
  OptionGroupInUseError,
  ProductOptionVersionConflictError,
  VariantCombinationDuplicateError,
  VariantBarcodeDuplicateError,
  VariantHasInventoryError,
  VariantProductNotFoundError,
  VariantService,
  VariantSkuDuplicateError,
} from "@/modules/variants/service";
import { ProductRepository } from "@/server/repositories/products";
import type { TenantContext } from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringIdDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)("variant and option lifecycle transaction", () => {
  const suffix = crypto.randomUUID();
  const tenantId = `org_variant_${suffix}`;
  const otherTenantId = `org_variant_other_${suffix}`;
  const storeId = `store_variant_${suffix}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;
  let productId: string;
  let colorGroupId: string;
  let sizeGroupId: string;
  let materialGroupId: string;
  let blackValueId: string;
  let tanValueId: string;
  let mediumValueId: string;
  let largeValueId: string;
  let stockedVariantId: string;
  let zeroStockVariantId: string;

  const ownerContext: TenantContext = {
    tenantId,
    tenantSlug: `variant-${suffix}`,
    userId: `usr_variant_${suffix}`,
    sessionId: `session_variant_${suffix}`,
    membershipId: `member_variant_${suffix}`,
    roles: ["OWNER"],
    permissions: resolvePermissions(["OWNER"]),
    allowedStoreIds: new Set([storeId]),
    activeStoreId: storeId,
    requestId: `request_variant_${suffix}`,
  };

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringIdDocument>("tenantProfiles").insertMany([
      {
        _id: `profile_variant_${suffix}`,
        tenantId,
        slug: ownerContext.tenantSlug,
        businessName: "Variant Integration",
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
        _id: `profile_variant_other_${suffix}`,
        tenantId: otherTenantId,
        slug: `variant-other-${suffix}`,
        businessName: "Other Variant Integration",
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
    productId = (
      await new ProductService().createSimple(ownerContext, {
        name: "Everyday Oxford",
        sku: `OX-${suffix.slice(0, 8)}`,
        category: "Apparel",
        priceMinor: 7_900,
        openingStock: 5,
      })
    ).id;
  });

  afterAll(async () => {
    for (const collection of [
      "auditLogs",
      "categories",
      "inventoryLevels",
      "inventoryMovements",
      "productVariants",
      "products",
      "stores",
      "tenantProfiles",
      "units",
    ])
      await database.collection(collection).deleteMany({
        tenantId: { $in: [tenantId, otherTenantId] },
      });
    await client.close();
  });

  it("creates stable option groups with product-level concurrency", async () => {
    const service = new VariantService();
    const color = await service.createOptionGroup(ownerContext, {
      productId,
      expectedProductVersion: 1,
      name: "Color",
      values: ["Black", "Tan"],
    });
    colorGroupId = color.id;
    await expect(
      service.createOptionGroup(ownerContext, {
        productId,
        expectedProductVersion: 2,
        name: " COLOR ",
        values: ["Blue", "White"],
      }),
    ).rejects.toBeInstanceOf(OptionGroupDuplicateError);

    const size = await service.createOptionGroup(ownerContext, {
      productId,
      expectedProductVersion: 2,
      name: "Size",
      values: ["Medium", "Large"],
    });
    sizeGroupId = size.id;
    const material = await service.createOptionGroup(ownerContext, {
      productId,
      expectedProductVersion: 3,
      name: "Material",
      values: ["Cotton", "Linen"],
    });
    materialGroupId = material.id;

    await expect(
      service.createOptionGroup(ownerContext, {
        productId,
        expectedProductVersion: 3,
        name: "Stale option",
        values: ["One", "Two"],
      }),
    ).rejects.toBeInstanceOf(ProductOptionVersionConflictError);

    const archived = await service.archiveOptionGroup(ownerContext, {
      productId,
      optionGroupId: materialGroupId,
      expectedProductVersion: 4,
    });
    expect(archived).toEqual({
      productVersion: 5,
      alreadyArchived: false,
    });

    const product = await database
      .collection<StringIdDocument>("products")
      .findOne({ _id: productId, tenantId });
    const groups = product?.optionGroups as Array<{
      id: string;
      values: Array<{ id: string; label: string }>;
    }>;
    blackValueId = groups
      .find((group) => group.id === colorGroupId)!
      .values.find((value) => value.label === "Black")!.id;
    tanValueId = groups
      .find((group) => group.id === colorGroupId)!
      .values.find((value) => value.label === "Tan")!.id;
    mediumValueId = groups
      .find((group) => group.id === sizeGroupId)!
      .values.find((value) => value.label === "Medium")!.id;
    largeValueId = groups
      .find((group) => group.id === sizeGroupId)!
      .values.find((value) => value.label === "Large")!.id;
  });

  it("enforces complete combinations and tenant-wide variant SKUs", async () => {
    const service = new VariantService();
    const stocked = await service.createVariant(ownerContext, {
      productId,
      expectedProductVersion: 5,
      sku: `OX-BLK-M-${suffix.slice(0, 6)}`,
      barcode: `BC-BLK-M-${suffix.slice(0, 6)}`,
      priceMinor: 8_400,
      costMinor: 4_100,
      optionValues: [
        { optionId: colorGroupId, valueId: blackValueId },
        { optionId: sizeGroupId, valueId: mediumValueId },
      ],
    });
    stockedVariantId = stocked.id;

    await expect(
      service.createVariant(ownerContext, {
        productId,
        expectedProductVersion: 6,
        sku: `OX-DUPE-${suffix.slice(0, 6)}`,
        priceMinor: 8_400,
        optionValues: [
          { optionId: colorGroupId, valueId: blackValueId },
          { optionId: sizeGroupId, valueId: mediumValueId },
        ],
      }),
    ).rejects.toBeInstanceOf(VariantCombinationDuplicateError);

    const zeroStock = await service.createVariant(ownerContext, {
      productId,
      expectedProductVersion: 6,
      sku: `OX-BLK-L-${suffix.slice(0, 6)}`,
      barcode: `BC-BLK-L-${suffix.slice(0, 6)}`,
      priceMinor: 8_600,
      costMinor: 4_200,
      optionValues: [
        { optionId: colorGroupId, valueId: blackValueId },
        { optionId: sizeGroupId, valueId: largeValueId },
      ],
    });
    zeroStockVariantId = zeroStock.id;

    await expect(
      service.createVariant(ownerContext, {
        productId,
        expectedProductVersion: 7,
        sku: `OX-BC-DUPE-${suffix.slice(0, 6)}`,
        barcode: `BC-BLK-M-${suffix.slice(0, 6)}`,
        priceMinor: 8_900,
        costMinor: 4_300,
        optionValues: [
          { optionId: colorGroupId, valueId: tanValueId },
          { optionId: sizeGroupId, valueId: mediumValueId },
        ],
      }),
    ).rejects.toBeInstanceOf(VariantBarcodeDuplicateError);

    await expect(
      service.createVariant(ownerContext, {
        productId,
        expectedProductVersion: 7,
        sku: `OX-BLK-M-${suffix.slice(0, 6)}`,
        priceMinor: 8_900,
        optionValues: [
          { optionId: colorGroupId, valueId: tanValueId },
          { optionId: sizeGroupId, valueId: mediumValueId },
        ],
      }),
    ).rejects.toBeInstanceOf(VariantSkuDuplicateError);
  });

  it("renames groups and appends values without rewriting combinations", async () => {
    const service = new VariantService();
    const result = await service.updateOptionGroup(ownerContext, {
      productId,
      optionGroupId: colorGroupId,
      expectedProductVersion: 7,
      name: "Finish",
      newValues: ["Navy"],
    });
    expect(result.productVersion).toBe(8);

    const [variantBefore, detail] = await Promise.all([
      database.collection<StringIdDocument>("productVariants").findOne({
        _id: stockedVariantId,
        tenantId,
      }),
      new ProductRepository().detail(ownerContext, productId),
    ]);
    expect(variantBefore?.optionValues).toEqual([
      { optionId: colorGroupId, valueId: blackValueId },
      { optionId: sizeGroupId, valueId: mediumValueId },
    ]);
    expect(detail?.optionGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: colorGroupId,
          name: "Finish",
          activeVariantCount: 2,
        }),
      ]),
    );
    expect(
      detail?.variants.find((variant) => variant.id === stockedVariantId),
    ).toMatchObject({
      name: "Black / Medium",
      optionValues: [
        expect.objectContaining({ optionName: "Finish", valueLabel: "Black" }),
        expect.objectContaining({ optionName: "Size", valueLabel: "Medium" }),
      ],
    });

    await expect(
      service.createOptionGroup(ownerContext, {
        productId,
        expectedProductVersion: 8,
        name: "Sleeve",
        values: ["Long", "Short"],
      }),
    ).rejects.toBeInstanceOf(OptionConfigurationLockedError);
  });

  it("updates only non-default tenant-owned variants and audits changes", async () => {
    const service = new VariantService();
    await expect(
      service.updateVariant(ownerContext, {
        productId,
        variantId: `${productId}_default`,
        expectedVariantVersion: 1,
        sku: `BASE-${suffix.slice(0, 6)}`,
        priceMinor: 1,
      }),
    ).rejects.toBeInstanceOf(DefaultVariantImmutableError);

    const updated = await service.updateVariant(ownerContext, {
      productId,
      variantId: stockedVariantId,
      expectedVariantVersion: 1,
      sku: `OX-BLACK-M-${suffix.slice(0, 6)}`,
      barcode: `BC-BLACK-M-${suffix.slice(0, 6)}`,
      priceMinor: 8_700,
      costMinor: 4_400,
    });
    expect(updated.variantVersion).toBe(2);

    await expect(
      service.updateVariant(
        {
          ...ownerContext,
          tenantId: otherTenantId,
          tenantSlug: `variant-other-${suffix}`,
        },
        {
          productId,
          variantId: stockedVariantId,
          expectedVariantVersion: 2,
          sku: `CROSS-${suffix.slice(0, 6)}`,
          priceMinor: 1,
        },
      ),
    ).rejects.toBeInstanceOf(VariantProductNotFoundError);

    await expect(
      service.updateVariant(
        {
          ...ownerContext,
          roles: ["VIEWER"],
          permissions: resolvePermissions(["VIEWER"]),
        },
        {
          productId,
          variantId: stockedVariantId,
          expectedVariantVersion: 2,
          sku: `NOPE-${suffix.slice(0, 6)}`,
          priceMinor: 1,
        },
      ),
    ).rejects.toBeInstanceOf(PermissionError);

    const audit = await database.collection("auditLogs").findOne({
      tenantId,
      entityId: stockedVariantId,
      action: "product.variant.updated",
    });
    expect(audit).toMatchObject({ actorId: ownerContext.userId });
    const detail = await new ProductRepository().detail(
      ownerContext,
      productId,
    );
    expect(
      detail?.variants.find((variant) => variant.id === stockedVariantId),
    ).toMatchObject({
      barcode: `BC-BLACK-M-${suffix.slice(0, 6)}`,
      costMinor: 4_400,
      priceMinor: 8_700,
    });
  });

  it("blocks stock-bearing archives and preserves inventory history", async () => {
    const now = new Date();
    await database.collection<StringIdDocument>("inventoryLevels").insertOne({
      _id: `level_variant_${suffix}`,
      tenantId,
      storeId,
      variantId: stockedVariantId,
      quantity: 3,
      version: 1,
      createdAt: now,
      updatedAt: now,
      updatedBy: ownerContext.userId,
    });
    const service = new VariantService();
    await expect(
      service.archiveVariant(ownerContext, {
        productId,
        variantId: stockedVariantId,
        expectedVariantVersion: 2,
      }),
    ).rejects.toBeInstanceOf(VariantHasInventoryError);
    await expect(
      service.archiveOptionGroup(ownerContext, {
        productId,
        optionGroupId: colorGroupId,
        expectedProductVersion: 9,
      }),
    ).rejects.toBeInstanceOf(OptionGroupInUseError);

    const [levelsBefore, movementsBefore] = await Promise.all([
      database.collection("inventoryLevels").find({ tenantId }).toArray(),
      database.collection("inventoryMovements").find({ tenantId }).toArray(),
    ]);
    const archived = await service.archiveVariant(ownerContext, {
      productId,
      variantId: zeroStockVariantId,
      expectedVariantVersion: 1,
    });
    const second = await service.archiveVariant(ownerContext, {
      productId,
      variantId: zeroStockVariantId,
      expectedVariantVersion: 1,
    });
    const [variant, product, levelsAfter, movementsAfter, audit] =
      await Promise.all([
        database.collection<StringIdDocument>("productVariants").findOne({
          _id: zeroStockVariantId,
          tenantId,
        }),
        database.collection<StringIdDocument>("products").findOne({
          _id: productId,
          tenantId,
        }),
        database.collection("inventoryLevels").find({ tenantId }).toArray(),
        database.collection("inventoryMovements").find({ tenantId }).toArray(),
        database.collection("auditLogs").findOne({
          tenantId,
          entityId: zeroStockVariantId,
          action: "product.variant.archived",
        }),
      ]);

    expect(archived).toEqual({
      variantVersion: 2,
      alreadyArchived: false,
    });
    expect(second).toEqual({ variantVersion: 2, alreadyArchived: true });
    expect(variant).toMatchObject({ status: "archived", version: 2 });
    expect(product).toMatchObject({ type: "variant", version: 10 });
    expect(levelsAfter).toEqual(levelsBefore);
    expect(movementsAfter).toEqual(movementsBefore);
    expect(audit).toMatchObject({ actorId: ownerContext.userId });
  });
});
