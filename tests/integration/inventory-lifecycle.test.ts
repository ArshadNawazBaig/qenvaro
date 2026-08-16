import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  InventoryIdempotencyConflictError,
  InventoryNegativeStockError,
  InventoryService,
  InventoryVersionConflictError,
} from "@/modules/inventory/service";
import {
  PermissionError,
  resolvePermissions,
} from "@/modules/permissions/permissions";
import { ProductService } from "@/modules/products/service";
import { InventoryRepository } from "@/server/repositories/inventory";
import {
  TenantNotFoundError,
  type TenantContext,
} from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringIdDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)("inventory adjustment and transfer lifecycle", () => {
  const suffix = crypto.randomUUID();
  const tenantId = `org_inventory_${suffix}`;
  const sourceStoreId = `store_inventory_source_${suffix}`;
  const destinationStoreId = `store_inventory_destination_${suffix}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;
  let firstProductId: string;
  let secondProductId: string;

  const ownerContext: TenantContext = {
    tenantId,
    tenantSlug: `inventory-${suffix}`,
    userId: `usr_inventory_${suffix}`,
    sessionId: `session_inventory_${suffix}`,
    membershipId: `member_inventory_${suffix}`,
    roles: ["OWNER"],
    permissions: resolvePermissions(["OWNER"]),
    allowedStoreIds: new Set([sourceStoreId, destinationStoreId]),
    activeStoreId: sourceStoreId,
    requestId: `request_inventory_${suffix}`,
  };

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringIdDocument>("tenantProfiles").insertOne({
      _id: `profile_inventory_${suffix}`,
      tenantId,
      slug: ownerContext.tenantSlug,
      businessName: "Inventory Integration",
      currency: "USD",
      locale: "en-US",
      timezone: "UTC",
      planKey: "growth",
      billingStatus: "trialing",
      trialEndsAt: new Date(now.getTime() + 86_400_000),
      inventorySettings: { allowNegativeStock: false },
      createdAt: now,
      updatedAt: now,
    });
    await database.collection<StringIdDocument>("stores").insertMany([
      {
        _id: sourceStoreId,
        tenantId,
        code: "MAIN",
        name: "Main Store",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: destinationStoreId,
        tenantId,
        code: "WH",
        name: "Warehouse",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const products = new ProductService();
    firstProductId = (
      await products.createSimple(ownerContext, {
        name: "Inventory Counter Kit",
        sku: `INV-A-${suffix.slice(0, 8)}`,
        category: "Hardware",
        priceMinor: 12_500,
        openingStock: 10,
      })
    ).id;
    secondProductId = (
      await products.createSimple(ownerContext, {
        name: "Inventory Label Roll",
        sku: `INV-B-${suffix.slice(0, 8)}`,
        category: "Hardware",
        priceMinor: 2_500,
        openingStock: 5,
      })
    ).id;
  });

  afterAll(async () => {
    for (const collection of [
      "auditLogs",
      "categories",
      "stockAdjustments",
      "stockTransfers",
      "inventoryLevels",
      "inventoryMovements",
      "productVariants",
      "products",
      "stores",
      "tenantProfiles",
    ])
      await database.collection(collection).deleteMany({ tenantId });
    await client.close();
  });

  it("posts an adjustment once and updates the projection and aggregate", async () => {
    const service = new InventoryService();
    const input = {
      storeId: sourceStoreId,
      variantId: `${firstProductId}_default`,
      mode: "increase" as const,
      quantity: 3,
      reason: "cycle_count" as const,
      note: "Verified during morning count",
      expectedLevelVersion: 1,
      idempotencyKey: `adjustment:${suffix}`,
    };
    const first = await service.adjust(ownerContext, input);
    const retry = await service.adjust(ownerContext, input);
    const [level, product, movements, adjustments, audit] = await Promise.all([
      database.collection<StringIdDocument>("inventoryLevels").findOne({
        tenantId,
        storeId: sourceStoreId,
        variantId: input.variantId,
      }),
      database.collection<StringIdDocument>("products").findOne({
        tenantId,
        _id: firstProductId,
      }),
      database.collection("inventoryMovements").countDocuments({
        tenantId,
        sourceType: "stock_adjustment",
        sourceId: first.id,
      }),
      database.collection("stockAdjustments").countDocuments({
        tenantId,
        idempotencyKey: input.idempotencyKey,
      }),
      database.collection<StringIdDocument>("auditLogs").findOne({
        tenantId,
        entityId: first.id,
        action: "inventory.adjusted",
      }),
    ]);

    expect(first).toMatchObject({ newQuantity: 13, idempotent: false });
    expect(retry).toEqual({ ...first, idempotent: true });
    expect(level).toMatchObject({ quantity: 13, version: 2 });
    expect(product).toMatchObject({ stock: 13 });
    expect(movements).toBe(1);
    expect(adjustments).toBe(1);
    expect(audit).toMatchObject({
      actorId: ownerContext.userId,
      requestId: ownerContext.requestId,
    });
  });

  it("rejects stale, negative, reused-key, and unauthorized adjustments", async () => {
    const service = new InventoryService();
    const base = {
      storeId: sourceStoreId,
      variantId: `${firstProductId}_default`,
      mode: "decrease" as const,
      quantity: 1,
      reason: "damaged" as const,
      note: "Damaged packaging found",
      expectedLevelVersion: 1,
      idempotencyKey: `adjustment-stale:${suffix}`,
    };
    await expect(service.adjust(ownerContext, base)).rejects.toBeInstanceOf(
      InventoryVersionConflictError,
    );
    await expect(
      service.adjust(ownerContext, {
        ...base,
        quantity: 20,
        expectedLevelVersion: 2,
        idempotencyKey: `adjustment-negative:${suffix}`,
      }),
    ).rejects.toBeInstanceOf(InventoryNegativeStockError);
    await expect(
      service.adjust(ownerContext, {
        ...base,
        quantity: 2,
        expectedLevelVersion: 2,
        idempotencyKey: `adjustment:${suffix}`,
      }),
    ).rejects.toBeInstanceOf(InventoryIdempotencyConflictError);
    await expect(
      service.adjust(
        {
          ...ownerContext,
          roles: ["VIEWER"],
          permissions: resolvePermissions(["VIEWER"]),
        },
        { ...base, expectedLevelVersion: 2 },
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("moves multiple SKUs atomically without changing tenant-wide totals", async () => {
    const service = new InventoryService();
    const input = {
      fromStoreId: sourceStoreId,
      toStoreId: destinationStoreId,
      note: "Warehouse replenishment run",
      idempotencyKey: `transfer:${suffix}`,
      lines: [
        {
          variantId: `${firstProductId}_default`,
          quantity: 4,
          expectedSourceVersion: 2,
          expectedDestinationVersion: 0,
        },
        {
          variantId: `${secondProductId}_default`,
          quantity: 2,
          expectedSourceVersion: 1,
          expectedDestinationVersion: 0,
        },
      ],
    };
    const first = await service.transfer(ownerContext, input);
    const retry = await service.transfer(ownerContext, input);
    const [levels, movements, transfer, products, audit] = await Promise.all([
      database
        .collection<StringIdDocument>("inventoryLevels")
        .find({
          tenantId,
          variantId: { $in: input.lines.map((line) => line.variantId) },
        })
        .sort({ variantId: 1, storeId: 1 })
        .toArray(),
      database
        .collection<StringIdDocument>("inventoryMovements")
        .find({ tenantId, sourceType: "stock_transfer", sourceId: first.id })
        .toArray(),
      database.collection<StringIdDocument>("stockTransfers").findOne({
        tenantId,
        _id: first.id,
      }),
      database
        .collection<StringIdDocument>("products")
        .find({ tenantId, _id: { $in: [firstProductId, secondProductId] } })
        .sort({ _id: 1 })
        .toArray(),
      database.collection<StringIdDocument>("auditLogs").findOne({
        tenantId,
        entityId: first.id,
        action: "inventory.transferred",
      }),
    ]);

    expect(retry).toEqual({ ...first, idempotent: true });
    expect(levels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          storeId: sourceStoreId,
          variantId: `${firstProductId}_default`,
          quantity: 9,
          version: 3,
        }),
        expect.objectContaining({
          storeId: destinationStoreId,
          variantId: `${firstProductId}_default`,
          quantity: 4,
          version: 1,
        }),
        expect.objectContaining({
          storeId: sourceStoreId,
          variantId: `${secondProductId}_default`,
          quantity: 3,
          version: 2,
        }),
        expect.objectContaining({
          storeId: destinationStoreId,
          variantId: `${secondProductId}_default`,
          quantity: 2,
          version: 1,
        }),
      ]),
    );
    expect(movements).toHaveLength(4);
    expect(
      movements.reduce(
        (sum, movement) => sum + Number(movement.quantityDelta),
        0,
      ),
    ).toBe(0);
    expect(transfer).toMatchObject({
      status: "completed",
      lines: expect.any(Array),
    });
    expect(transfer?.lines as unknown[] | undefined).toHaveLength(2);
    expect(
      products
        .map((product) => Number(product.stock))
        .sort((left, right) => left - right),
    ).toEqual([5, 13]);
    expect(audit).toMatchObject({ actorId: ownerContext.userId });
  });

  it("enforces store scope and preserves all projections on a failed transfer", async () => {
    const service = new InventoryService();
    const sourceBefore = await database
      .collection<StringIdDocument>("inventoryLevels")
      .findOne({
        tenantId,
        storeId: sourceStoreId,
        variantId: `${firstProductId}_default`,
      });
    const destinationBefore = await database
      .collection<StringIdDocument>("inventoryLevels")
      .findOne({
        tenantId,
        storeId: destinationStoreId,
        variantId: `${firstProductId}_default`,
      });
    const input = {
      fromStoreId: sourceStoreId,
      toStoreId: destinationStoreId,
      note: "Should not post",
      idempotencyKey: `transfer-negative:${suffix}`,
      lines: [
        {
          variantId: `${firstProductId}_default`,
          quantity: 100,
          expectedSourceVersion: 3,
          expectedDestinationVersion: 1,
        },
      ],
    };
    await expect(service.transfer(ownerContext, input)).rejects.toBeInstanceOf(
      InventoryNegativeStockError,
    );
    await expect(
      service.transfer(
        {
          ...ownerContext,
          allowedStoreIds: new Set([sourceStoreId]),
        },
        { ...input, idempotencyKey: `transfer-forbidden:${suffix}` },
      ),
    ).rejects.toBeInstanceOf(TenantNotFoundError);
    const [sourceAfter, destinationAfter] = await Promise.all([
      database.collection<StringIdDocument>("inventoryLevels").findOne({
        tenantId,
        storeId: sourceStoreId,
        variantId: `${firstProductId}_default`,
      }),
      database.collection<StringIdDocument>("inventoryLevels").findOne({
        tenantId,
        storeId: destinationStoreId,
        variantId: `${firstProductId}_default`,
      }),
    ]);
    expect(sourceAfter).toEqual(sourceBefore);
    expect(destinationAfter).toEqual(destinationBefore);
  });

  it("reads only the active authorized store projection", async () => {
    const repository = new InventoryRepository();
    const source = await repository.overview(ownerContext);
    const destination = await repository.overview({
      ...ownerContext,
      activeStoreId: destinationStoreId,
    });
    const unrelated = await repository.overview({
      ...ownerContext,
      tenantId: `org_inventory_other_${suffix}`,
      tenantSlug: "other-inventory",
    });

    expect(source.store?.id).toBe(sourceStoreId);
    expect(
      source.rows.find((row) => row.variantId === `${firstProductId}_default`),
    ).toMatchObject({ quantity: 9 });
    expect(
      destination.rows.find(
        (row) => row.variantId === `${firstProductId}_default`,
      ),
    ).toMatchObject({ quantity: 4 });
    expect(unrelated.rows).toHaveLength(0);
  });
});
