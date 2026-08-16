import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dashboardQuerySchema } from "@/modules/dashboard/schemas";
import { resolvePermissions } from "@/modules/permissions/permissions";
import { DashboardRepository } from "@/server/repositories/dashboard";
import type { TenantContext } from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const tenantId = `org_dashboard_${suffix}`;
const otherTenantId = `org_dashboard_other_${suffix}`;
const userId = `usr_dashboard_${suffix}`;
const storeA = `store_dashboard_a_${suffix}`;
const storeB = `store_dashboard_b_${suffix}`;
const hiddenStore = `store_dashboard_hidden_${suffix}`;
const now = new Date("2026-08-16T12:00:00.000Z");
let client: MongoClient;
let database: Db;
type StringDocument = { _id: string } & Record<string, unknown>;

function context(roles: TenantContext["roles"] = ["OWNER"]): TenantContext {
  return {
    tenantId,
    tenantSlug: `dashboard-${suffix}`,
    userId,
    sessionId: `session_dashboard_${suffix}`,
    membershipId: `member_dashboard_${suffix}`,
    roles,
    permissions: resolvePermissions(roles),
    allowedStoreIds: new Set([storeA, storeB]),
    activeStoreId: storeA,
    requestId: `request_dashboard_${suffix}`,
  };
}

describe.skipIf(!enabled)("dashboard repository projection", () => {
  beforeAll(async () => {
    const uri = process.env.MONGODB_URI;
    expect(uri).toBeTruthy();
    client = new MongoClient(uri!);
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const [salesIndexes, auditIndexes] = await Promise.all([
      database.collection("sales").indexes(),
      database.collection("auditLogs").indexes(),
    ]);
    expect(salesIndexes.map((index) => index.name)).toContain(
      "tenant_store_sales_date",
    );
    expect(auditIndexes.map((index) => index.name)).toContain(
      "tenant_audit_date",
    );

    await database.collection<StringDocument>("tenantProfiles").insertMany([
      {
        _id: `profile_dashboard_${suffix}`,
        tenantId,
        slug: `dashboard-${suffix}`,
        businessName: "Dashboard Test Co.",
        currency: "USD",
        locale: "en-US",
        timezone: "Asia/Karachi",
        planKey: "growth",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `profile_dashboard_other_${suffix}`,
        tenantId: otherTenantId,
        slug: `dashboard-other-${suffix}`,
        businessName: "Other Dashboard Co.",
        currency: "USD",
        locale: "en-US",
        timezone: "UTC",
        planKey: "growth",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.collection<StringDocument>("user").insertOne({
      _id: userId,
      name: "Dani Dashboard",
      email: `dashboard-${suffix}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await database.collection<StringDocument>("member").insertOne({
      _id: `member_dashboard_${suffix}`,
      organizationId: tenantId,
      userId,
      role: "owner",
      createdAt: now,
    });
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
        code: "HIDDEN",
        name: "Hidden",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.collection<StringDocument>("sales").insertMany([
      {
        _id: `sale_dashboard_a1_${suffix}`,
        tenantId,
        storeId: storeA,
        status: "completed",
        netTotalMinor: 10_000,
        grossProfitMinor: 4_000,
        completedAt: new Date("2026-08-15T10:00:00.000Z"),
        idempotencyKey: `dashboard-a1-${suffix}`,
      },
      {
        _id: `sale_dashboard_a2_${suffix}`,
        tenantId,
        storeId: storeA,
        status: "completed",
        netTotalMinor: 2_000,
        completedAt: new Date("2026-08-15T11:00:00.000Z"),
        idempotencyKey: `dashboard-a2-${suffix}`,
      },
      {
        _id: `sale_dashboard_b_${suffix}`,
        tenantId,
        storeId: storeB,
        status: "completed",
        netTotalMinor: 30_000,
        grossProfitMinor: 12_000,
        completedAt: new Date("2026-08-14T10:00:00.000Z"),
        idempotencyKey: `dashboard-b-${suffix}`,
      },
      {
        _id: `sale_dashboard_hidden_${suffix}`,
        tenantId,
        storeId: hiddenStore,
        status: "completed",
        netTotalMinor: 90_000,
        grossProfitMinor: 36_000,
        completedAt: new Date("2026-08-14T10:00:00.000Z"),
        idempotencyKey: `dashboard-hidden-${suffix}`,
      },
      {
        _id: `sale_dashboard_previous_${suffix}`,
        tenantId,
        storeId: storeA,
        status: "completed",
        netTotalMinor: 5_000,
        grossProfitMinor: 2_000,
        completedAt: new Date("2026-08-05T10:00:00.000Z"),
        idempotencyKey: `dashboard-previous-${suffix}`,
      },
      {
        _id: `sale_dashboard_draft_${suffix}`,
        tenantId,
        storeId: storeA,
        status: "draft",
        netTotalMinor: 70_000,
        grossProfitMinor: 28_000,
        completedAt: new Date("2026-08-15T10:00:00.000Z"),
        idempotencyKey: `dashboard-draft-${suffix}`,
      },
      {
        _id: `sale_dashboard_other_${suffix}`,
        tenantId: otherTenantId,
        storeId: storeA,
        status: "completed",
        netTotalMinor: 500_000,
        grossProfitMinor: 200_000,
        completedAt: new Date("2026-08-15T10:00:00.000Z"),
        idempotencyKey: `dashboard-other-${suffix}`,
      },
    ]);
    await database.collection<StringDocument>("auditLogs").insertMany([
      {
        _id: `audit_dashboard_${suffix}`,
        tenantId,
        action: "product.created",
        summary: "Created a dashboard test product.",
        createdAt: new Date("2026-08-16T11:00:00.000Z"),
      },
      {
        _id: `audit_dashboard_private_${suffix}`,
        tenantId,
        action: "billing.subscription.changed",
        summary: "This event is not allow-listed.",
        createdAt: new Date("2026-08-16T11:30:00.000Z"),
      },
      {
        _id: `audit_dashboard_other_${suffix}`,
        tenantId: otherTenantId,
        action: "product.created",
        summary: "Other tenant event.",
        createdAt: new Date("2026-08-16T11:45:00.000Z"),
      },
    ]);
  });

  afterAll(async () => {
    if (!database || !client) return;
    await Promise.all([
      database.collection<StringDocument>("tenantProfiles").deleteMany({
        tenantId: { $in: [tenantId, otherTenantId] },
      }),
      database.collection<StringDocument>("stores").deleteMany({ tenantId }),
      database.collection<StringDocument>("sales").deleteMany({
        tenantId: { $in: [tenantId, otherTenantId] },
      }),
      database.collection<StringDocument>("auditLogs").deleteMany({
        tenantId: { $in: [tenantId, otherTenantId] },
      }),
      database
        .collection<StringDocument>("member")
        .deleteMany({ organizationId: tenantId }),
      database.collection<StringDocument>("user").deleteOne({ _id: userId }),
    ]);
    await client.close();
  });

  it("returns bounded active-store trends and authorized store comparisons", async () => {
    const result = await new DashboardRepository().overview(
      context(),
      dashboardQuerySchema.parse({ range: "7d" }),
      now,
    );

    expect(result.businessName).toBe("Dashboard Test Co.");
    expect(result.firstName).toBe("Dani");
    expect(result.periodStart).toBe("2026-08-09T19:00:00.000Z");
    expect(result.periodEnd).toBe("2026-08-16T19:00:00.000Z");
    expect(result.trend).toHaveLength(7);
    expect(result.sales).toMatchObject({
      netSalesMinor: 12_000,
      grossProfitMinor: null,
      completedSales: 2,
      averageOrderMinor: 6_000,
      marginPercent: null,
      changePercent: 140,
    });
    expect(
      result.trend.find((point) => point.date === "2026-08-15"),
    ).toMatchObject({
      netSalesMinor: 12_000,
      grossProfitMinor: null,
      completedSales: 2,
    });
    expect(result.stores.map((store) => store.storeId)).toEqual([
      storeB,
      storeA,
    ]);
    expect(result.stores[0]).toMatchObject({
      netSalesMinor: 30_000,
      completedSales: 1,
    });
    expect(result.stores[0]?.sharePercent).toBeCloseTo(71.43, 2);
  });

  it("returns only allow-listed activity for the current tenant", async () => {
    const result = await new DashboardRepository().overview(
      context(),
      dashboardQuerySchema.parse({ range: "7d" }),
      now,
    );

    expect(result.activity).toEqual([
      expect.objectContaining({
        id: `audit_dashboard_${suffix}`,
        action: "product.created",
        title: "Product created",
        summary: "Created a dashboard test product.",
      }),
    ]);
  });

  it("does not substitute hidden values when the role lacks dashboard permissions", async () => {
    const result = await new DashboardRepository().overview(
      context(["EMPLOYEE"]),
      dashboardQuerySchema.parse({ range: "30d" }),
      now,
    );

    expect(result.canViewSales).toBe(false);
    expect(result.canViewActivity).toBe(false);
    expect(result.teamMemberCount).toBeNull();
    expect(result.sales.netSalesMinor).toBe(0);
    expect(result.trend).toHaveLength(30);
    expect(result.stores).toEqual([]);
    expect(result.activity).toEqual([]);
  });
});
