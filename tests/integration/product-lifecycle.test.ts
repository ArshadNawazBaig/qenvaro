import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PermissionError,
  resolvePermissions,
} from "@/modules/permissions/permissions";
import {
  ProductService,
  ProductVersionConflictError,
} from "@/modules/products/service";
import { ProductRepository } from "@/server/repositories/products";
import type { TenantContext } from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringIdDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)("product lifecycle transaction", () => {
  const suffix = crypto.randomUUID();
  const tenantId = `org_product_${suffix}`;
  const otherTenantId = `org_product_other_${suffix}`;
  const storeId = `store_product_${suffix}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;
  let productId: string;

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
    productId = (
      await new ProductService().createSimple(ownerContext, {
        name: "Counter Kit",
        sku: `CK-${suffix.slice(0, 8)}`,
        category: "Hardware",
        priceMinor: 89_000,
        openingStock: 7,
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

  it("updates product and default variant atomically and audits the change", async () => {
    const result = await new ProductService().update(ownerContext, {
      productId,
      expectedVersion: 1,
      name: "Counter Kit Pro",
      subtitle: "Updated retail hardware bundle",
      sku: `CK-PRO-${suffix.slice(0, 8)}`,
      category: "Hardware",
      priceMinor: 99_000,
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
      stock: 7,
      status: "draft",
      version: 2,
    });
    expect(variant).toMatchObject({
      sku: `CK-PRO-${suffix.slice(0, 8)}`,
      priceMinor: 99_000,
      version: 2,
    });
    expect(audit).toMatchObject({
      actorId: ownerContext.userId,
      requestId: ownerContext.requestId,
    });
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
