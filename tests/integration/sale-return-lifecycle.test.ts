import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InventoryVersionConflictError } from "@/modules/inventory/service";
import {
  PermissionError,
  resolvePermissions,
} from "@/modules/permissions/permissions";
import { ProductService } from "@/modules/products/service";
import { SaleReturnQuantityError } from "@/modules/sales/return-policy";
import {
  SaleReturnIdempotencyConflictError,
  SaleReturnNotFoundError,
  SaleReturnService,
  SaleReturnStoreUnavailableError,
} from "@/modules/sales/return-service";
import { SaleService } from "@/modules/sales/service";
import { SaleReturnRepository } from "@/server/repositories/sale-returns";
import type { TenantContext } from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringIdDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)("atomic sale return and refund lifecycle", () => {
  const suffix = crypto.randomUUID();
  const tenantId = `org_return_${suffix}`;
  const otherTenantId = `org_return_other_${suffix}`;
  const storeId = `store_return_${suffix}`;
  const otherStoreId = `store_return_other_${suffix}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;
  let productId: string;
  let saleId: string;
  let firstReturnId: string;

  const ownerContext: TenantContext = {
    tenantId,
    tenantSlug: `return-${suffix}`,
    userId: `usr_return_${suffix}`,
    sessionId: `session_return_${suffix}`,
    membershipId: `member_return_${suffix}`,
    roles: ["OWNER"],
    permissions: resolvePermissions(["OWNER"]),
    allowedStoreIds: new Set([storeId]),
    activeStoreId: storeId,
    requestId: `request_return_${suffix}`,
  };
  const otherContext: TenantContext = {
    ...ownerContext,
    tenantId: otherTenantId,
    tenantSlug: `return-other-${suffix}`,
    allowedStoreIds: new Set([otherStoreId]),
    activeStoreId: otherStoreId,
  };

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringIdDocument>("tenantProfiles").insertMany([
      {
        _id: `profile_return_${suffix}`,
        tenantId,
        slug: ownerContext.tenantSlug,
        businessName: "Return Integration",
        currency: "PKR",
        locale: "en-PK",
        timezone: "Asia/Karachi",
        planKey: "growth",
        billingStatus: "trialing",
        trialEndsAt: new Date(now.getTime() + 86_400_000),
        inventorySettings: { allowNegativeStock: false },
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `profile_return_other_${suffix}`,
        tenantId: otherTenantId,
        slug: otherContext.tenantSlug,
        businessName: "Other Return Integration",
        currency: "PKR",
        locale: "en-PK",
        timezone: "Asia/Karachi",
        planKey: "starter",
        billingStatus: "trialing",
        trialEndsAt: new Date(now.getTime() + 86_400_000),
        inventorySettings: { allowNegativeStock: false },
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.collection<StringIdDocument>("stores").insertMany([
      {
        _id: storeId,
        tenantId,
        code: "MAIN",
        name: "Main Store",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: otherStoreId,
        tenantId: otherTenantId,
        code: "MAIN",
        name: "Other Store",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    productId = (
      await new ProductService().createSimple(ownerContext, {
        name: "Return Counter Kit",
        sku: `RETURN-${suffix.slice(0, 8)}`,
        category: "Hardware",
        priceMinor: 1_000,
        openingStock: 10,
      })
    ).id;
    await database
      .collection<StringIdDocument>("products")
      .updateOne(
        { _id: productId, tenantId },
        { $set: { costMinor: 400, taxRateBps: 1_000 } },
      );
    saleId = (
      await new SaleService().complete(ownerContext, {
        storeId,
        customerId: "",
        lines: [
          {
            variantId: `${productId}_default`,
            quantity: 3,
            discountBps: 333,
            expectedLevelVersion: 1,
          },
        ],
        payments: [{ method: "cash", tenderedMinor: 3_500 }],
        note: "Private original sale note",
        idempotencyKey: `sale:return-source:${suffix}`,
      })
    ).id;
  });

  afterAll(async () => {
    for (const collection of [
      "auditLogs",
      "inventoryLevels",
      "inventoryMovements",
      "productVariants",
      "products",
      "receipts",
      "refunds",
      "returns",
      "salePayments",
      "sales",
      "sequenceCounters",
      "stores",
      "tenantProfiles",
      "units",
    ])
      await database.collection(collection).deleteMany({
        tenantId: { $in: [tenantId, otherTenantId] },
      });
    await client.close();
  });

  const firstReturnInput = () => ({
    saleId,
    storeId,
    lines: [
      {
        saleLineId: "line_1",
        quantity: 1,
        expectedLevelVersion: 2,
      },
    ],
    refundMethod: "cash" as const,
    reason: "customer_request" as const,
    note: "Private return note",
    idempotencyKey: `return:first:${suffix}`,
  });

  it("projects scoped history and remaining original-sale allocations", async () => {
    const repository = new SaleReturnRepository();
    const history = await repository.history(ownerContext, {
      q: "MAIN-000001",
      page: 1,
      pageSize: 10,
    });
    expect(history).toMatchObject({ total: 1, page: 1, pageSize: 10 });
    expect(history.items[0]).toMatchObject({
      id: saleId,
      receiptNumber: "MAIN-000001",
      totalMinor: 3_190,
      returnedTotalMinor: 0,
      unitCount: 3,
    });
    const workspace = await repository.workspace(ownerContext, saleId);
    expect(workspace).toMatchObject({
      sale: { id: saleId, receiptNumber: "MAIN-000001", totalMinor: 3_190 },
      store: { id: storeId, code: "MAIN" },
      returnedTotalMinor: 0,
      remainingTotalMinor: 3_190,
      lines: [
        expect.objectContaining({
          lineId: "line_1",
          originalQuantity: 3,
          returnedQuantity: 0,
          remainingQuantity: 3,
          levelVersion: 2,
        }),
      ],
    });
    await expect(
      repository.workspace(otherContext, saleId),
    ).resolves.toBeNull();
  });

  it("atomically records a partial refund, receipt, and stock restoration", async () => {
    const result = await new SaleReturnService().complete(
      ownerContext,
      firstReturnInput(),
    );
    firstReturnId = result.id;
    expect(result).toMatchObject({
      saleId,
      returnNumber: "MAIN-R-000001",
      idempotent: false,
    });
    const [returned, refund, receipt, level, movement, product, sale, audit] =
      await Promise.all([
        database.collection<StringIdDocument>("returns").findOne({
          _id: firstReturnId,
          tenantId,
        }),
        database.collection<StringIdDocument>("refunds").findOne({
          tenantId,
          returnId: firstReturnId,
        }),
        database.collection<StringIdDocument>("receipts").findOne({
          tenantId,
          returnId: firstReturnId,
        }),
        database.collection<StringIdDocument>("inventoryLevels").findOne({
          tenantId,
          storeId,
          variantId: `${productId}_default`,
        }),
        database.collection<StringIdDocument>("inventoryMovements").findOne({
          tenantId,
          sourceType: "sale_return",
          sourceId: firstReturnId,
        }),
        database.collection<StringIdDocument>("products").findOne({
          tenantId,
          _id: productId,
        }),
        database.collection<StringIdDocument>("sales").findOne({
          tenantId,
          _id: saleId,
        }),
        database.collection<StringIdDocument>("auditLogs").findOne({
          tenantId,
          entityId: firstReturnId,
          action: "sale.returned",
        }),
      ]);
    expect(returned).toMatchObject({
      originalReceiptNumber: "MAIN-000001",
      returnNumber: "MAIN-R-000001",
      reason: "customer_request",
      refundMethod: "cash",
      subtotalMinor: 1_000,
      discountMinor: 33,
      taxMinor: 97,
      netTotalMinor: 967,
      totalMinor: 1_064,
      grossProfitReversalMinor: 567,
      lines: [
        expect.objectContaining({
          saleLineId: "line_1",
          quantity: 1,
          lineTotalMinor: 1_064,
        }),
      ],
    });
    expect(refund).toMatchObject({
      method: "cash",
      amountMinor: 1_064,
      provider: "manual",
      status: "recorded",
    });
    expect(receipt).toMatchObject({
      entityType: "return",
      receiptNumber: "MAIN-R-000001",
      status: "issued",
    });
    expect(level).toMatchObject({ quantity: 8, version: 3 });
    expect(movement).toMatchObject({
      type: "sale_return",
      quantityDelta: 1,
      resultingQuantity: 8,
    });
    expect(product).toMatchObject({ stock: 8, revenueMinor: 1_933 });
    expect(sale).toMatchObject({
      returnedNetTotalMinor: 967,
      returnedTotalMinor: 1_064,
      returnedUnitCount: 1,
      returnedGrossProfitMinor: 567,
    });
    expect(audit).toMatchObject({
      changes: {
        after: {
          saleId,
          returnNumber: "MAIN-R-000001",
          lineCount: 1,
          unitCount: 1,
          status: "completed",
        },
      },
    });
    const auditText = JSON.stringify(audit);
    for (const privateValue of [
      "Private return note",
      "Private original sale note",
      "customer_request",
      "cash",
      "1064",
    ])
      expect(auditText).not.toContain(privateValue);
  });

  it("replays only an identical return and rolls back stale stock", async () => {
    await expect(
      new SaleReturnService().complete(ownerContext, firstReturnInput()),
    ).resolves.toEqual({
      id: firstReturnId,
      saleId,
      returnNumber: "MAIN-R-000001",
      idempotent: true,
    });
    await expect(
      new SaleReturnService().complete(ownerContext, {
        ...firstReturnInput(),
        note: "Different request with the same key",
      }),
    ).rejects.toBeInstanceOf(SaleReturnIdempotencyConflictError);
    await expect(
      new SaleReturnService().complete(ownerContext, {
        ...firstReturnInput(),
        lines: [{ saleLineId: "line_1", quantity: 1, expectedLevelVersion: 2 }],
        note: "Stale return",
        idempotencyKey: `return:stale:${suffix}`,
      }),
    ).rejects.toBeInstanceOf(InventoryVersionConflictError);
    expect(
      await database.collection("returns").countDocuments({ tenantId }),
    ).toBe(1);
    expect(
      await database.collection("sequenceCounters").findOne({
        tenantId,
        storeId,
        sequenceType: "return",
      }),
    ).toMatchObject({ value: 1 });
  });

  it("returns archived historical SKUs and reconciles the final rounding remainder", async () => {
    const archivedAt = new Date();
    await Promise.all([
      database
        .collection<StringIdDocument>("products")
        .updateOne(
          { tenantId, _id: productId },
          { $set: { status: "archived", deletedAt: archivedAt } },
        ),
      database
        .collection<StringIdDocument>("productVariants")
        .updateOne(
          { tenantId, _id: `${productId}_default` },
          { $set: { status: "archived", deletedAt: archivedAt } },
        ),
    ]);
    const result = await new SaleReturnService().complete(ownerContext, {
      saleId,
      storeId,
      lines: [{ saleLineId: "line_1", quantity: 2, expectedLevelVersion: 3 }],
      refundMethod: "card",
      reason: "defective",
      note: "Historical archived SKU",
      idempotencyKey: `return:final:${suffix}`,
    });
    expect(result.returnNumber).toBe("MAIN-R-000002");
    const [returned, level, product, workspace] = await Promise.all([
      database.collection<StringIdDocument>("returns").findOne({
        tenantId,
        _id: result.id,
      }),
      database.collection<StringIdDocument>("inventoryLevels").findOne({
        tenantId,
        storeId,
        variantId: `${productId}_default`,
      }),
      database.collection<StringIdDocument>("products").findOne({
        tenantId,
        _id: productId,
      }),
      new SaleReturnRepository().workspace(ownerContext, saleId),
    ]);
    expect(returned).toMatchObject({
      subtotalMinor: 2_000,
      discountMinor: 67,
      taxMinor: 193,
      totalMinor: 2_126,
    });
    expect(level).toMatchObject({ quantity: 10, version: 4 });
    expect(product).toMatchObject({
      status: "archived",
      stock: 10,
      revenueMinor: 0,
    });
    expect(workspace).toMatchObject({
      returnedTotalMinor: 3_190,
      remainingTotalMinor: 0,
      lines: [
        expect.objectContaining({
          returnedQuantity: 3,
          remainingQuantity: 0,
        }),
      ],
    });
    await expect(
      new SaleReturnService().complete(ownerContext, {
        saleId,
        storeId,
        lines: [{ saleLineId: "line_1", quantity: 1, expectedLevelVersion: 4 }],
        refundMethod: "cash",
        reason: "other",
        note: "No units remain",
        idempotencyKey: `return:over:${suffix}`,
      }),
    ).rejects.toBeInstanceOf(SaleReturnQuantityError);
  });

  it("enforces permission, active-store, and cross-tenant boundaries", async () => {
    const service = new SaleReturnService();
    await expect(
      service.complete(
        {
          ...ownerContext,
          roles: ["VIEWER"],
          permissions: resolvePermissions(["VIEWER"]),
        },
        { ...firstReturnInput(), idempotencyKey: `return:denied:${suffix}` },
      ),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(
      service.complete(
        { ...ownerContext, activeStoreId: null },
        { ...firstReturnInput(), idempotencyKey: `return:store:${suffix}` },
      ),
    ).rejects.toBeInstanceOf(SaleReturnStoreUnavailableError);
    await expect(
      service.complete(otherContext, {
        ...firstReturnInput(),
        storeId: otherStoreId,
        idempotencyKey: `return:tenant:${suffix}`,
      }),
    ).rejects.toBeInstanceOf(SaleReturnNotFoundError);
  });

  it("scopes return receipts and provisions return/refund indexes", async () => {
    const repository = new SaleReturnRepository();
    const receipt = await repository.receipt(
      ownerContext,
      saleId,
      firstReturnId,
    );
    expect(receipt).toMatchObject({
      id: firstReturnId,
      returnNumber: "MAIN-R-000001",
      originalReceiptNumber: "MAIN-000001",
      totalMinor: 1_064,
      refund: { method: "cash", amountMinor: 1_064, status: "recorded" },
    });
    await expect(
      repository.receipt(otherContext, saleId, firstReturnId),
    ).resolves.toBeNull();
    const [returnIndexes, refundIndexes, receiptIndexes] = await Promise.all([
      database.collection("returns").indexes(),
      database.collection("refunds").indexes(),
      database.collection("receipts").indexes(),
    ]);
    expect(returnIndexes.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        "tenant_return_idempotency_unique",
        "tenant_store_return_number_unique",
        "tenant_sale_returns",
      ]),
    );
    expect(refundIndexes.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        "tenant_return_refund_unique",
        "tenant_sale_refunds",
      ]),
    );
    expect(receiptIndexes.map((index) => index.name)).toContain(
      "tenant_return_receipt_unique",
    );
  });
});
