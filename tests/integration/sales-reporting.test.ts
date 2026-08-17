import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PermissionError,
  resolvePermissions,
} from "@/modules/permissions/permissions";
import { salesReportQuerySchema } from "@/modules/reports/sales-schemas";
import { SalesReportExportService } from "@/modules/reports/sales-export-service";
import { SalesReportRepository } from "@/server/repositories/sales-reports";
import type { TenantContext } from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const tenantId = `org_report_${suffix}`;
const otherTenantId = `org_report_other_${suffix}`;
const storeA = `store_report_a_${suffix}`;
const storeB = `store_report_b_${suffix}`;
const hiddenStore = `store_report_hidden_${suffix}`;
const saleA = `sale_report_a_${suffix}`;
const saleB = `sale_report_b_${suffix}`;
const returnA = `return_report_a_${suffix}`;
const now = new Date("2026-08-17T12:00:00.000Z");
type StringDocument = { _id: string } & Record<string, unknown>;
let client: MongoClient;
let database: Db;

function context(roles: TenantContext["roles"] = ["OWNER"]): TenantContext {
  return {
    tenantId,
    tenantSlug: `report-${suffix}`,
    userId: `user_report_${suffix}`,
    sessionId: `session_report_${suffix}`,
    membershipId: `member_report_${suffix}`,
    roles,
    permissions: resolvePermissions(roles),
    allowedStoreIds: new Set([storeA, storeB]),
    activeStoreId: storeA,
    requestId: `request_report_${suffix}`,
  };
}

describe.skipIf(!enabled)("returns-aware sales reporting", () => {
  beforeAll(async () => {
    client = new MongoClient(process.env.MONGODB_URI!);
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    await database.collection<StringDocument>("tenantProfiles").insertMany([
      {
        _id: `profile_report_${suffix}`,
        tenantId,
        slug: `report-${suffix}`,
        businessName: "Reporting Test Co.",
        currency: "USD",
        locale: "en-US",
        timezone: "Asia/Karachi",
        planKey: "business",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `profile_report_other_${suffix}`,
        tenantId: otherTenantId,
        slug: `report-other-${suffix}`,
        businessName: "Other Reporting Co.",
        currency: "USD",
        locale: "en-US",
        timezone: "UTC",
        planKey: "business",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.collection<StringDocument>("stores").insertMany([
      {
        _id: storeA,
        tenantId,
        code: "A",
        name: "Alpha",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: storeB,
        tenantId,
        code: "B",
        name: "Beta",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: hiddenStore,
        tenantId,
        code: "H",
        name: "Hidden",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.collection<StringDocument>("sales").insertMany([
      {
        _id: saleA,
        tenantId,
        storeId: storeA,
        receiptNumber: `A-${suffix}`,
        customer: { id: "customer-a", code: "C-1", name: "Ari Stone" },
        status: "completed",
        currency: "USD",
        lines: [
          {
            lineId: "line-a",
            productId: "product-a",
            productName: "Alpha Product",
            variantId: "variant-a",
            variantName: "Default",
            sku: "ALPHA",
            quantity: 2,
            subtotalMinor: 10_000,
            discountMinor: 1_000,
            taxMinor: 900,
            lineTotalMinor: 9_900,
            grossProfitMinor: 4_000,
          },
        ],
        subtotalMinor: 10_000,
        discountMinor: 1_000,
        netTotalMinor: 9_000,
        taxMinor: 900,
        totalMinor: 9_900,
        grossProfitMinor: 4_000,
        completedAt: new Date("2026-08-16T10:00:00.000Z"),
        idempotencyKey: `report-sale-a-${suffix}`,
      },
      {
        _id: saleB,
        tenantId,
        storeId: storeB,
        receiptNumber: `B-${suffix}`,
        customer: null,
        status: "completed",
        currency: "USD",
        lines: [
          {
            lineId: "line-b",
            productId: "product-b",
            productName: "Beta Product",
            variantId: "variant-b",
            variantName: "Default",
            sku: "BETA",
            quantity: 1,
            subtotalMinor: 5_000,
            discountMinor: 0,
            taxMinor: 400,
            lineTotalMinor: 5_400,
            grossProfitMinor: 2_000,
          },
        ],
        subtotalMinor: 5_000,
        discountMinor: 0,
        netTotalMinor: 5_000,
        taxMinor: 400,
        totalMinor: 5_400,
        grossProfitMinor: 2_000,
        completedAt: new Date("2026-08-15T10:00:00.000Z"),
        idempotencyKey: `report-sale-b-${suffix}`,
      },
      {
        _id: `sale_report_hidden_${suffix}`,
        tenantId,
        storeId: hiddenStore,
        receiptNumber: `H-${suffix}`,
        status: "completed",
        lines: [],
        subtotalMinor: 900_000,
        discountMinor: 0,
        netTotalMinor: 900_000,
        taxMinor: 0,
        totalMinor: 900_000,
        grossProfitMinor: 400_000,
        completedAt: new Date("2026-08-16T10:00:00.000Z"),
        idempotencyKey: `report-sale-hidden-${suffix}`,
      },
      {
        _id: `sale_report_other_${suffix}`,
        tenantId: otherTenantId,
        storeId: storeA,
        receiptNumber: `OTHER-${suffix}`,
        status: "completed",
        lines: [],
        subtotalMinor: 800_000,
        discountMinor: 0,
        netTotalMinor: 800_000,
        taxMinor: 0,
        totalMinor: 800_000,
        grossProfitMinor: 300_000,
        completedAt: new Date("2026-08-16T10:00:00.000Z"),
        idempotencyKey: `report-sale-other-${suffix}`,
      },
    ]);
    await database.collection<StringDocument>("returns").insertOne({
      _id: returnA,
      tenantId,
      storeId: storeA,
      saleId: `historical_sale_${suffix}`,
      originalReceiptNumber: `A-OLD-${suffix}`,
      returnNumber: `A-R-${suffix}`,
      status: "completed",
      currency: "USD",
      lines: [
        {
          lineId: "return-line-a",
          saleLineId: "old-line-a",
          productId: "product-a",
          productName: "Alpha Product",
          variantId: "variant-a",
          variantName: "Default",
          sku: "ALPHA",
          quantity: 1,
          subtotalMinor: 2_000,
          discountMinor: 0,
          netTotalMinor: 2_000,
          taxMinor: 200,
          lineTotalMinor: 2_200,
          grossProfitReversalMinor: 800,
        },
      ],
      subtotalMinor: 2_000,
      discountMinor: 0,
      netTotalMinor: 2_000,
      taxMinor: 200,
      totalMinor: 2_200,
      grossProfitReversalMinor: 800,
      completedAt: new Date("2026-08-17T09:00:00.000Z"),
      idempotencyKey: `report-return-${suffix}`,
    });
    await database.collection<StringDocument>("salePayments").insertMany([
      {
        _id: `payment_report_a_${suffix}`,
        tenantId,
        storeId: storeA,
        saleId: saleA,
        method: "card",
        appliedMinor: 9_900,
        status: "recorded",
        recordedAt: new Date("2026-08-16T10:00:00.000Z"),
      },
      {
        _id: `payment_report_b_${suffix}`,
        tenantId,
        storeId: storeB,
        saleId: saleB,
        method: "cash",
        appliedMinor: 5_400,
        status: "recorded",
        recordedAt: new Date("2026-08-15T10:00:00.000Z"),
      },
    ]);
    await database.collection<StringDocument>("refunds").insertOne({
      _id: `refund_report_a_${suffix}`,
      tenantId,
      storeId: storeA,
      saleId: `historical_sale_${suffix}`,
      returnId: returnA,
      method: "card",
      amountMinor: 2_200,
      status: "recorded",
      recordedAt: new Date("2026-08-17T09:00:00.000Z"),
    });
  });

  afterAll(async () => {
    if (!database || !client) return;
    await Promise.all(
      [
        "tenantProfiles",
        "stores",
        "sales",
        "returns",
        "salePayments",
        "refunds",
        "importExportJobs",
        "auditLogs",
      ].map((collection) =>
        database.collection(collection).deleteMany({
          tenantId: { $in: [tenantId, otherTenantId] },
        }),
      ),
    );
    await client.close();
  });

  it("reports sales and return events by tenant-local period and assigned stores", async () => {
    const report = await new SalesReportRepository().overview(
      context(),
      salesReportQuerySchema.parse({ range: "7d", store: "all" }),
      now,
    );
    expect(report.periodStart).toBe("2026-08-10T19:00:00.000Z");
    expect(report.periodEnd).toBe("2026-08-17T19:00:00.000Z");
    expect(report.summary).toMatchObject({
      grossSalesMinor: 15_000,
      discountMinor: 1_000,
      returnNetMinor: 2_000,
      refundTotalMinor: 2_200,
      netSalesMinor: 12_000,
      taxMinor: 1_100,
      grossProfitMinor: 5_200,
      completedSales: 2,
      completedReturns: 1,
      unitsSold: 3,
      unitsReturned: 1,
      averageOrderMinor: 6_000,
    });
    expect(report.paymentMethods).toEqual([
      expect.objectContaining({ method: "card", amountMinor: 9_900 }),
      expect.objectContaining({ method: "cash", amountMinor: 5_400 }),
    ]);
    expect(report.refundMethods).toEqual([
      expect.objectContaining({ method: "card", amountMinor: 2_200 }),
    ]);
    expect(report.storeContribution).toEqual([
      expect.objectContaining({ id: storeA, netSalesMinor: 7_000 }),
      expect.objectContaining({ id: storeB, netSalesMinor: 5_000 }),
    ]);
    expect(report.productContribution).toEqual([
      expect.objectContaining({
        productId: "product-a",
        netSalesMinor: 7_000,
        unitsReturned: 1,
      }),
      expect.objectContaining({ productId: "product-b", netSalesMinor: 5_000 }),
    ]);
    expect(report.transactions.total).toBe(3);
    expect(report.transactions.items.map((item) => item.reference)).toEqual([
      `A-R-${suffix}`,
      `A-${suffix}`,
      `B-${suffix}`,
    ]);
  });

  it("supports a scoped store drill-down and rejects hidden stores and roles", async () => {
    const report = await new SalesReportRepository().overview(
      context(),
      salesReportQuerySchema.parse({ range: "30d", store: storeB }),
      now,
    );
    expect(report.summary).toMatchObject({
      grossSalesMinor: 5_000,
      netSalesMinor: 5_000,
      refundTotalMinor: 0,
      completedSales: 1,
    });
    expect(report.storeContribution.map((store) => store.id)).toEqual([storeB]);
    await expect(
      new SalesReportRepository().overview(
        context(),
        salesReportQuerySchema.parse({ range: "7d", store: hiddenStore }),
        now,
      ),
    ).rejects.toThrow("unavailable");
    await expect(
      new SalesReportRepository().overview(
        context(["EMPLOYEE"]),
        salesReportQuerySchema.parse({ range: "7d", store: "all" }),
        now,
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("exports an audited, store-scoped daily CSV for authorized roles", async () => {
    const service = new SalesReportExportService();
    const result = await service.export(
      context(),
      salesReportQuerySchema.parse({ range: "7d", store: "all" }),
      now,
    );
    const [job, audit] = await Promise.all([
      database.collection<StringDocument>("importExportJobs").findOne({
        tenantId,
        type: "sales_report_csv_export",
      }),
      database.collection<StringDocument>("auditLogs").findOne({
        tenantId,
        action: "report.sales_csv_export.completed",
      }),
    ]);

    expect(result.rowCount).toBe(7);
    expect(result.csv).toContain("date,business,store_filter,gross_sales");
    expect(result.csv).toContain("100.00");
    expect(result.csv).not.toContain("9000.00");
    expect(job).toMatchObject({ rowCount: 7, createdBy: context().userId });
    expect(audit).toMatchObject({
      actorId: context().userId,
      requestId: context().requestId,
    });
    await expect(
      service.export(
        context(["MANAGER"]),
        salesReportQuerySchema.parse({ range: "7d", store: "all" }),
        now,
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("uses the dedicated bounded reporting indexes", async () => {
    const [returnIndexes, paymentIndexes, refundIndexes] = await Promise.all([
      database.collection("returns").indexes(),
      database.collection("salePayments").indexes(),
      database.collection("refunds").indexes(),
    ]);
    expect(returnIndexes.map((index) => index.name)).toContain(
      "tenant_store_returns_date",
    );
    expect(paymentIndexes.map((index) => index.name)).toContain(
      "tenant_store_sale_payment_reports",
    );
    expect(refundIndexes.map((index) => index.name)).toContain(
      "tenant_store_refund_reports",
    );
  });
});
