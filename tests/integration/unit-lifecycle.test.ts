import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PermissionError,
  resolvePermissions,
} from "@/modules/permissions/permissions";
import {
  ProductService,
  ProductUnitUnavailableError,
} from "@/modules/products/service";
import { unitListQuerySchema } from "@/modules/units/schemas";
import {
  UnitDuplicateError,
  UnitService,
  UnitVersionConflictError,
} from "@/modules/units/service";
import { ProductRepository } from "@/server/repositories/products";
import { UnitRepository } from "@/server/repositories/units";
import type { TenantContext } from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringIdDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)("unit of measure lifecycle transaction", () => {
  const suffix = crypto.randomUUID();
  const tenantId = `org_unit_${suffix}`;
  const otherTenantId = `org_unit_other_${suffix}`;
  const storeId = `store_unit_${suffix}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;
  let kilogramId: string;
  let boxId: string;
  let otherUnitId: string;
  let productId: string;

  const ownerContext: TenantContext = {
    tenantId,
    tenantSlug: `unit-${suffix}`,
    userId: `usr_unit_${suffix}`,
    sessionId: `session_unit_${suffix}`,
    membershipId: `member_unit_${suffix}`,
    roles: ["OWNER"],
    permissions: resolvePermissions(["OWNER"]),
    allowedStoreIds: new Set([storeId]),
    activeStoreId: storeId,
    requestId: `request_unit_${suffix}`,
  };

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringIdDocument>("tenantProfiles").insertMany([
      {
        _id: `profile_unit_${suffix}`,
        tenantId,
        slug: ownerContext.tenantSlug,
        businessName: "Unit Integration",
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
        _id: `profile_unit_other_${suffix}`,
        tenantId: otherTenantId,
        slug: `unit-other-${suffix}`,
        businessName: "Other Unit Integration",
        currency: "USD",
        locale: "en-US",
        timezone: "UTC",
        planKey: "starter",
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

  it("enforces normalized name and symbol uniqueness per tenant", async () => {
    const service = new UnitService();
    kilogramId = (
      await service.create(ownerContext, {
        name: "Kilogram",
        symbol: "kg",
        description: "Weight-based stock reference.",
      })
    ).id;
    boxId = (
      await service.create(ownerContext, {
        name: "Box",
        symbol: "box",
        description: "A complete packaged box.",
      })
    ).id;

    await expect(
      service.create(ownerContext, {
        name: "  KILOGRAM ",
        symbol: "kilo",
        description: "Duplicate normalized name.",
      }),
    ).rejects.toMatchObject({ field: "name" });
    await expect(
      service.create(ownerContext, {
        name: "Metric weight",
        symbol: " KG ",
        description: "Duplicate normalized symbol.",
      }),
    ).rejects.toMatchObject({ field: "symbol" });

    otherUnitId = (
      await service.create(
        {
          ...ownerContext,
          tenantId: otherTenantId,
          tenantSlug: `unit-other-${suffix}`,
        },
        {
          name: "Kilogram",
          symbol: "kg",
          description: "The same identity is valid in another tenant.",
        },
      )
    ).id;
    expect(otherUnitId).toBeTruthy();
  });

  it("assigns an active tenant unit and reports scoped usage", async () => {
    productId = (
      await new ProductService().createSimple(ownerContext, {
        name: "Coffee beans",
        sku: `UNIT-${suffix.slice(0, 8)}`,
        category: "Pantry",
        unitId: kilogramId,
        priceMinor: 2_400,
        openingStock: 8,
      })
    ).id;

    const repository = new UnitRepository();
    const [result, options, product] = await Promise.all([
      repository.list(
        ownerContext,
        unitListQuerySchema.parse({ q: "Kilogram" }),
      ),
      repository.activeOptions(ownerContext),
      new ProductRepository().detail(ownerContext, productId),
    ]);
    expect(result.items[0]).toMatchObject({
      id: kilogramId,
      activeProductCount: 1,
      totalProductCount: 1,
    });
    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: kilogramId, symbol: "kg" }),
      ]),
    );
    expect(product).toMatchObject({
      unitId: kilogramId,
      unit: { id: kilogramId, name: "Kilogram", symbol: "kg" },
    });
  });

  it("blocks assigned archive, unauthorized writes, and cross-tenant units", async () => {
    await expect(
      new UnitService().archive(ownerContext, {
        unitId: kilogramId,
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ productCount: 1 });

    await expect(
      new UnitService().create(
        {
          ...ownerContext,
          roles: ["VIEWER"],
          permissions: resolvePermissions(["VIEWER"]),
        },
        { name: "Unauthorized", symbol: "no", description: "" },
      ),
    ).rejects.toBeInstanceOf(PermissionError);

    await expect(
      new ProductService().update(ownerContext, {
        productId,
        expectedVersion: 1,
        name: "Coffee beans",
        subtitle: "Roasted coffee",
        sku: `UNIT-${suffix.slice(0, 8)}`,
        category: "Pantry",
        unitId: otherUnitId,
        priceMinor: 2_400,
        reorderLevel: 2,
        status: "active",
      }),
    ).rejects.toBeInstanceOf(ProductUnitUnavailableError);
  });

  it("renames without rewriting assignments and rejects stale writes", async () => {
    const result = await new UnitService().update(ownerContext, {
      unitId: kilogramId,
      expectedVersion: 1,
      name: "Kilogram weight",
      symbol: "kg",
      description: "Metric weight used for stocked products.",
    });
    const [unit, product, audit] = await Promise.all([
      database.collection<StringIdDocument>("units").findOne({
        _id: kilogramId,
        tenantId,
      }),
      database.collection<StringIdDocument>("products").findOne({
        _id: productId,
        tenantId,
      }),
      database.collection("auditLogs").findOne({
        tenantId,
        entityId: kilogramId,
        action: "unit.updated",
      }),
    ]);
    expect(result).toEqual({ version: 2 });
    expect(unit).toMatchObject({ name: "Kilogram weight", version: 2 });
    expect(product).toMatchObject({ unitId: kilogramId, version: 1 });
    expect(audit).toMatchObject({ actorId: ownerContext.userId });

    await expect(
      new UnitService().update(ownerContext, {
        unitId: kilogramId,
        expectedVersion: 1,
        name: "Stale unit",
        symbol: "stale",
        description: "Should not persist.",
      }),
    ).rejects.toBeInstanceOf(UnitVersionConflictError);
    await expect(
      new UnitService().create(ownerContext, {
        name: "Kilogram weight",
        symbol: "different",
        description: "Still a duplicate.",
      }),
    ).rejects.toBeInstanceOf(UnitDuplicateError);
  });

  it("archives after reassignment and retains historical assignment counts", async () => {
    await new ProductService().update(ownerContext, {
      productId,
      expectedVersion: 1,
      name: "Coffee beans",
      subtitle: "Boxed roasted coffee",
      sku: `UNIT-${suffix.slice(0, 8)}`,
      category: "Pantry",
      unitId: boxId,
      priceMinor: 2_400,
      reorderLevel: 2,
      status: "active",
    });
    const first = await new UnitService().archive(ownerContext, {
      unitId: kilogramId,
      expectedVersion: 2,
    });
    const second = await new UnitService().archive(ownerContext, {
      unitId: kilogramId,
      expectedVersion: 2,
    });
    const [unit, product, options, result, audit] = await Promise.all([
      database.collection<StringIdDocument>("units").findOne({
        _id: kilogramId,
        tenantId,
      }),
      new ProductRepository().detail(ownerContext, productId),
      new UnitRepository().activeOptions(ownerContext),
      new UnitRepository().list(
        ownerContext,
        unitListQuerySchema.parse({ status: "archived" }),
      ),
      database.collection("auditLogs").findOne({
        tenantId,
        entityId: kilogramId,
        action: "unit.archived",
      }),
    ]);

    expect(first).toEqual({ version: 3, alreadyArchived: false });
    expect(second).toEqual({ version: 3, alreadyArchived: true });
    expect(unit).toMatchObject({ status: "archived", version: 3 });
    expect(product).toMatchObject({
      unitId: boxId,
      unit: expect.objectContaining({ id: boxId, name: "Box" }),
    });
    expect(options).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: kilogramId })]),
    );
    expect(result.items[0]).toMatchObject({
      id: kilogramId,
      activeProductCount: 0,
      totalProductCount: 0,
    });
    expect(audit).toMatchObject({ actorId: ownerContext.userId });
  });
});
