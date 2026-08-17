import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FeatureAccessError } from "@/modules/billing/entitlements";
import {
  PermissionError,
  resolvePermissions,
} from "@/modules/permissions/permissions";
import { ProductService } from "@/modules/products/service";
import { OperationsReportExportService } from "@/modules/reports/operations-export-service";
import {
  ExpenseService,
  PurchaseOrderService,
  SupplierService,
} from "@/modules/purchasing/service";
import { supplierListQuerySchema } from "@/modules/purchasing/schemas";
import { PurchasingRepository } from "@/server/repositories/purchasing";
import type { TenantContext } from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringIdDocument = { _id: string } & Record<string, unknown>;
type PurchaseTestDocument = StringIdDocument & {
  tenantId: string;
  lines: Array<{ lineId: string }>;
};

describe.skipIf(!enabled)("purchasing receiving and expense lifecycle", () => {
  const suffix = crypto.randomUUID();
  const tenantId = `org_purchase_${suffix}`;
  const otherTenantId = `org_purchase_other_${suffix}`;
  const storeId = `store_purchase_${suffix}`;
  const otherStoreId = `store_purchase_other_${suffix}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;
  let productId: string;
  let supplierId: string;
  let purchaseOrderId: string;
  let expenseId: string;

  const context: TenantContext = {
    tenantId,
    tenantSlug: `purchase-${suffix}`,
    userId: `usr_purchase_${suffix}`,
    sessionId: `session_purchase_${suffix}`,
    membershipId: `member_purchase_${suffix}`,
    roles: ["OWNER"],
    permissions: resolvePermissions(["OWNER"]),
    allowedStoreIds: new Set([storeId]),
    activeStoreId: storeId,
    requestId: `request_purchase_${suffix}`,
  };
  const otherContext: TenantContext = {
    ...context,
    tenantId: otherTenantId,
    tenantSlug: `purchase-other-${suffix}`,
    allowedStoreIds: new Set([otherStoreId]),
    activeStoreId: otherStoreId,
  };

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringIdDocument>("tenantProfiles").insertMany([
      {
        _id: `profile_purchase_${suffix}`,
        tenantId,
        slug: context.tenantSlug,
        businessName: "Purchase Integration",
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
        _id: `profile_purchase_other_${suffix}`,
        tenantId: otherTenantId,
        slug: otherContext.tenantSlug,
        businessName: "Other Purchase Integration",
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
        code: "OTHER",
        name: "Other Store",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    productId = (
      await new ProductService().createSimple(context, {
        name: "Purchase Integration Item",
        sku: `PUR-${suffix.slice(0, 8)}`,
        category: "Fixtures",
        priceMinor: 2_000,
        openingStock: 10,
      })
    ).id;
    await database
      .collection<StringIdDocument>("products")
      .updateOne({ _id: productId, tenantId }, { $set: { costMinor: 800 } });
  });

  afterAll(async () => {
    for (const collection of [
      "auditLogs",
      "categories",
      "expenses",
      "expenseCategories",
      "goodsReceipts",
      "inventoryLevels",
      "inventoryMovements",
      "importExportJobs",
      "productVariants",
      "products",
      "purchaseOrders",
      "sequenceCounters",
      "stores",
      "suppliers",
      "tenantProfiles",
      "units",
    ])
      await database
        .collection(collection)
        .deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
    await client.close();
  });

  it("creates tenant-scoped suppliers and enforces the purchasing plan gate", async () => {
    const service = new SupplierService();
    const supplier = await service.create(context, {
      name: "Private Supply Partner",
      contactName: "Private Contact",
      email: "private@supplier.example.test",
      phone: "+92 300 222 4455",
      address: "Private supplier address",
      taxNumber: "PRIVATE-TAX",
      paymentTerms: "Net 30",
      notes: "Private supplier note",
    });
    supplierId = supplier.id;
    const list = await new PurchasingRepository().suppliers(
      context,
      supplierListQuerySchema.parse({ q: "Private Supply" }),
    );
    expect(list).toMatchObject({ total: 1 });
    expect(list.items[0]).toMatchObject({ id: supplierId, status: "active" });

    await expect(
      service.create(otherContext, {
        name: "Starter Plan Supplier",
        contactName: "",
        email: "",
        phone: "",
        address: "",
        taxNumber: "",
        paymentTerms: "",
        notes: "",
      }),
    ).rejects.toBeInstanceOf(FeatureAccessError);
  });

  it("approves and receives a purchase into the ledger atomically", async () => {
    const service = new PurchaseOrderService();
    const created = await service.create(context, {
      supplierId,
      storeId,
      expectedDeliveryDate: "2026-08-25",
      note: "Private purchase note",
      lines: [
        {
          variantId: `${productId}_default`,
          quantity: 5,
          unitCostMinor: 800,
          taxRateBps: 1_000,
        },
      ],
      idempotencyKey: crypto.randomUUID(),
    });
    purchaseOrderId = created.id;
    await service.transition(context, {
      purchaseOrderId,
      expectedVersion: 1,
      targetStatus: "submitted",
      reason: "",
    });
    await service.transition(context, {
      purchaseOrderId,
      expectedVersion: 2,
      targetStatus: "approved",
      reason: "",
    });
    const receiptKey = crypto.randomUUID();
    const first = await service.receive(context, {
      purchaseOrderId,
      expectedVersion: 3,
      receivedAt: "2026-08-17T09:00:00.000Z",
      note: "First delivery",
      lines: [
        {
          lineId: String(
            (
              await database
                .collection<PurchaseTestDocument>("purchaseOrders")
                .findOne({ _id: purchaseOrderId, tenantId })
            )?.lines?.[0]?.lineId,
          ),
          quantity: 2,
        },
      ],
      idempotencyKey: receiptKey,
    });
    expect(first).toMatchObject({
      status: "partially_received",
      replayed: false,
    });
    const orderAfterFirst = await database
      .collection<PurchaseTestDocument>("purchaseOrders")
      .findOne({ _id: purchaseOrderId, tenantId });
    const second = await service.receive(context, {
      purchaseOrderId,
      expectedVersion: 4,
      receivedAt: "2026-08-17T10:00:00.000Z",
      note: "Final delivery",
      lines: [
        { lineId: String(orderAfterFirst?.lines?.[0]?.lineId), quantity: 3 },
      ],
      idempotencyKey: crypto.randomUUID(),
    });
    expect(second.status).toBe("received");
    const [order, level, product, movements, receipts] = await Promise.all([
      database
        .collection<StringIdDocument>("purchaseOrders")
        .findOne({ _id: purchaseOrderId, tenantId }),
      database
        .collection<StringIdDocument>("inventoryLevels")
        .findOne({ tenantId, storeId, variantId: `${productId}_default` }),
      database
        .collection<StringIdDocument>("products")
        .findOne({ tenantId, _id: productId }),
      database
        .collection("inventoryMovements")
        .find({
          tenantId,
          sourceType: "purchase_order",
          sourceId: purchaseOrderId,
        })
        .toArray(),
      database
        .collection("goodsReceipts")
        .find({ tenantId, purchaseOrderId })
        .toArray(),
    ]);
    expect(order).toMatchObject({ status: "received", version: 5 });
    expect(level).toMatchObject({ quantity: 15, version: 3 });
    expect(product).toMatchObject({ stock: 15 });
    expect(
      movements
        .map((movement) => movement.quantityDelta)
        .sort((left, right) => left - right),
    ).toEqual([2, 3]);
    expect(receipts).toHaveLength(2);
  });

  it("includes only approved expenses in operational totals", async () => {
    const service = new ExpenseService();
    const first = await service.create(context, {
      storeId,
      category: "Utilities",
      vendor: "Private Utility Vendor",
      expenseDate: "2026-08-17",
      amountMinor: 25_000,
      notes: "Private expense note",
      receiptUrl: "",
      idempotencyKey: crypto.randomUUID(),
    });
    expenseId = first.id;
    await service.create(context, {
      storeId,
      category: "Maintenance",
      vendor: "Pending Vendor",
      expenseDate: "2026-08-17",
      amountMinor: 10_000,
      notes: "",
      receiptUrl: "",
      idempotencyKey: crypto.randomUUID(),
    });
    await service.decide(context, {
      expenseId,
      expectedVersion: 1,
      decision: "approved",
      note: "Verified",
    });
    const summary = await new PurchasingRepository().operationsSummary(
      context,
      { range: "90d", store: "all" },
      new Date("2026-08-17T12:00:00.000Z"),
    );
    expect(summary).toMatchObject({
      approvedExpenseMinor: 25_000,
      submittedExpenseMinor: 10_000,
      expenseCount: 2,
      receiptCount: 2,
    });
    expect(summary.receivedPurchaseMinor).toBe(4_000);
    const expenseCategories = await database
      .collection("expenseCategories")
      .find({ tenantId })
      .sort({ normalizedName: 1 })
      .toArray();
    expect(expenseCategories.map((category) => category.name)).toEqual([
      "Maintenance",
      "Utilities",
    ]);
    const auditJson = JSON.stringify(
      await database
        .collection("auditLogs")
        .find({ tenantId, entityId: { $in: [supplierId, expenseId] } })
        .toArray(),
    );
    for (const privateValue of [
      "Private Contact",
      "private@supplier.example.test",
      "Private supplier address",
      "Private expense note",
      "25000",
    ])
      expect(auditJson).not.toContain(privateValue);
  });

  it("exports the authorized operations summary and records evidence", async () => {
    const result = await new OperationsReportExportService().export(
      context,
      { range: "90d", store: "all" },
      new Date("2026-08-17T12:00:00.000Z"),
    );
    expect(result.rowCount).toBeGreaterThanOrEqual(5);
    expect(result.csv).toContain("summary,Approved expenses,250.00,PKR,2");
    expect(result.csv).not.toContain(otherTenantId);
    await expect(
      new OperationsReportExportService().export({
        ...context,
        roles: ["VIEWER"],
        permissions: resolvePermissions(["VIEWER"]),
      }),
    ).rejects.toBeInstanceOf(PermissionError);
    const [job, audit] = await Promise.all([
      database.collection("importExportJobs").findOne({
        tenantId,
        type: "operations_report_csv_export",
      }),
      database.collection("auditLogs").findOne({
        tenantId,
        action: "report.operations_csv_export.completed",
      }),
    ]);
    expect(job).toMatchObject({
      status: "completed",
      rowCount: result.rowCount,
    });
    expect(audit).toMatchObject({
      actorId: context.userId,
      requestId: context.requestId,
    });
  });

  it("has migration-backed purchasing and expense indexes", async () => {
    expect(
      (await database.collection("purchaseOrders").indexes()).map(
        (index) => index.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        "tenant_purchase_idempotency_unique",
        "tenant_store_purchase_number_unique",
        "tenant_store_purchase_status",
      ]),
    );
    expect(
      (await database.collection("expenses").indexes()).map(
        (index) => index.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        "tenant_expense_idempotency_unique",
        "tenant_store_expense_status_date",
        "tenant_expense_reports",
      ]),
    );
    expect(
      (await database.collection("expenseCategories").indexes()).map(
        (index) => index.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        "tenant_expense_category_name_unique",
        "tenant_expense_category_directory",
      ]),
    );
  });
});
