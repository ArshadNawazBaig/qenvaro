import "server-only";
import { hasPermission } from "@/modules/permissions/permissions";
import {
  DASHBOARD_ACTIVITY_ACTIONS,
  completeTrend,
  dashboardActivityTitle,
  dashboardActivityTone,
  dashboardPeriod,
  summarizeSales,
} from "@/modules/dashboard/policy";
import type {
  DashboardActivityItem,
  DashboardOverview,
  DashboardQuery,
  DashboardStorePerformance,
} from "@/modules/dashboard/schemas";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

interface TenantProfileDocument {
  tenantId: string;
  businessName: string;
  currency: string;
  locale: string;
  timezone: string;
}

interface UserDocument {
  _id: string;
  name: string;
}

interface StoreDocument {
  _id: string;
  tenantId: string;
  code: string;
  name: string;
}

interface TrendAggregate {
  _id: string;
  netSalesMinor: number;
  grossProfitMinor: number;
  completedSales: number;
  profitRecordCount: number;
}

interface TotalAggregate {
  _id: null;
  netSalesMinor: number;
}

interface StoreAggregate {
  _id: string;
  netSalesMinor: number;
  completedSales: number;
}

interface AuditDocument {
  _id: string;
  tenantId: string;
  action: string;
  summary?: string;
  createdAt: Date;
}

function safeCurrency(value: string): string {
  return /^[A-Z]{3}$/.test(value) ? value : "USD";
}

function safeLocale(value: string): string {
  try {
    new Intl.NumberFormat(value).format(1);
    return value;
  } catch {
    return "en-US";
  }
}

function safeTimezone(value: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    return "UTC";
  }
}

function numeric(value: number | undefined): number {
  const candidate = Number(value ?? 0);
  return Number.isSafeInteger(candidate) ? candidate : 0;
}

export class DashboardRepository {
  async overview(
    context: TenantContext,
    query: DashboardQuery,
    now = new Date(),
  ): Promise<DashboardOverview> {
    const database = await getDatabase();
    const allowedStoreIds = [...context.allowedStoreIds];
    const canViewSales =
      hasPermission(context.permissions, "sale:read") ||
      hasPermission(context.permissions, "report:read");
    const canViewActivity = hasPermission(context.permissions, "audit:read");
    const canViewMembers = hasPermission(context.permissions, "member:read");
    const [profile, user, stores, teamMemberCount] = await Promise.all([
      database.collection<TenantProfileDocument>("tenantProfiles").findOne(
        { tenantId: context.tenantId },
        {
          projection: {
            businessName: 1,
            currency: 1,
            locale: 1,
            timezone: 1,
          },
        },
      ),
      database
        .collection<UserDocument>("user")
        .findOne({ _id: context.userId }, { projection: { name: 1 } }),
      allowedStoreIds.length === 0
        ? Promise.resolve([])
        : database
            .collection<StoreDocument>("stores")
            .find(
              {
                tenantId: context.tenantId,
                _id: { $in: allowedStoreIds },
                status: "active",
                deletedAt: { $exists: false },
              },
              { projection: { code: 1, name: 1 } },
            )
            .sort({ name: 1, _id: 1 })
            .limit(100)
            .toArray(),
      canViewMembers
        ? database.collection("member").countDocuments({
            organizationId: context.tenantId,
          })
        : Promise.resolve(null),
    ]);
    if (!profile || !user)
      throw new Error("The dashboard projection is incomplete.");

    const currency = safeCurrency(profile.currency);
    const locale = safeLocale(profile.locale);
    const timezone = safeTimezone(profile.timezone);
    const period = dashboardPeriod(query.range, timezone, now);
    const activeStoreDocument =
      stores.find((store) => String(store._id) === context.activeStoreId) ??
      null;
    const activeStore = activeStoreDocument
      ? {
          id: String(activeStoreDocument._id),
          code: activeStoreDocument.code,
          name: activeStoreDocument.name,
        }
      : null;

    const emptyTrend = completeTrend(period, [], locale, timezone);
    let trend = emptyTrend;
    let previousNetSalesMinor = 0;
    let storePerformance: DashboardStorePerformance[] = [];

    if (canViewSales && activeStore) {
      const [trendRows, previousTotal, storeRows] = await Promise.all([
        database
          .collection("sales")
          .aggregate<TrendAggregate>([
            {
              $match: {
                tenantId: context.tenantId,
                storeId: activeStore.id,
                status: "completed",
                completedAt: { $gte: period.start, $lt: period.end },
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: {
                    date: "$completedAt",
                    format: "%Y-%m-%d",
                    timezone,
                  },
                },
                netSalesMinor: { $sum: { $ifNull: ["$netTotalMinor", 0] } },
                grossProfitMinor: {
                  $sum: { $ifNull: ["$grossProfitMinor", 0] },
                },
                completedSales: { $sum: 1 },
                profitRecordCount: {
                  $sum: { $cond: [{ $isNumber: "$grossProfitMinor" }, 1, 0] },
                },
              },
            },
            { $sort: { _id: 1 } },
          ])
          .toArray(),
        database
          .collection("sales")
          .aggregate<TotalAggregate>([
            {
              $match: {
                tenantId: context.tenantId,
                storeId: activeStore.id,
                status: "completed",
                completedAt: {
                  $gte: period.previousStart,
                  $lt: period.start,
                },
              },
            },
            {
              $group: {
                _id: null,
                netSalesMinor: { $sum: { $ifNull: ["$netTotalMinor", 0] } },
              },
            },
          ])
          .next(),
        database
          .collection("sales")
          .aggregate<StoreAggregate>([
            {
              $match: {
                tenantId: context.tenantId,
                storeId: { $in: stores.map((store) => String(store._id)) },
                status: "completed",
                completedAt: { $gte: period.start, $lt: period.end },
              },
            },
            {
              $group: {
                _id: "$storeId",
                netSalesMinor: { $sum: { $ifNull: ["$netTotalMinor", 0] } },
                completedSales: { $sum: 1 },
              },
            },
          ])
          .toArray(),
      ]);
      trend = completeTrend(
        period,
        trendRows.map((row) => ({
          date: row._id,
          netSalesMinor: numeric(row.netSalesMinor),
          grossProfitMinor: numeric(row.grossProfitMinor),
          completedSales: numeric(row.completedSales),
          profitRecordCount: numeric(row.profitRecordCount),
        })),
        locale,
        timezone,
      );
      previousNetSalesMinor = numeric(previousTotal?.netSalesMinor);
      const salesByStore = new Map(
        storeRows.map((row) => [
          row._id,
          {
            netSalesMinor: numeric(row.netSalesMinor),
            completedSales: numeric(row.completedSales),
          },
        ]),
      );
      const authorizedNetSales = [...salesByStore.values()].reduce(
        (total, row) => total + row.netSalesMinor,
        0,
      );
      storePerformance = stores
        .map((store) => {
          const sales = salesByStore.get(String(store._id)) ?? {
            netSalesMinor: 0,
            completedSales: 0,
          };
          return {
            storeId: String(store._id),
            storeCode: store.code,
            storeName: store.name,
            netSalesMinor: sales.netSalesMinor,
            completedSales: sales.completedSales,
            sharePercent:
              authorizedNetSales === 0
                ? 0
                : (sales.netSalesMinor / authorizedNetSales) * 100,
          };
        })
        .sort(
          (left, right) =>
            right.netSalesMinor - left.netSalesMinor ||
            left.storeName.localeCompare(right.storeName) ||
            left.storeId.localeCompare(right.storeId),
        )
        .slice(0, 8);
    }

    let activity: DashboardActivityItem[] = [];
    if (canViewActivity) {
      const activityStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const events = await database
        .collection<AuditDocument>("auditLogs")
        .find(
          {
            tenantId: context.tenantId,
            action: { $in: [...DASHBOARD_ACTIVITY_ACTIONS] },
            createdAt: { $gte: activityStart, $lte: now },
          },
          { projection: { action: 1, summary: 1, createdAt: 1 } },
        )
        .sort({ createdAt: -1, _id: -1 })
        .limit(8)
        .toArray();
      activity = events.map((event) => ({
        id: String(event._id),
        action: event.action,
        title: dashboardActivityTitle(event.action),
        summary: (event.summary ?? "A workspace operation was completed.")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 240),
        occurredAt: event.createdAt.toISOString(),
        tone: dashboardActivityTone(event.action),
      }));
    }

    return {
      businessName: profile.businessName,
      firstName: user.name.trim().split(/\s+/)[0] || "there",
      teamMemberCount,
      currency,
      locale,
      timezone,
      range: query.range,
      rangeLabel: period.label,
      asOf: now.toISOString(),
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      activeStore,
      canViewSales,
      canViewActivity,
      sales: summarizeSales(trend, previousNetSalesMinor),
      trend,
      stores: storePerformance,
      activity,
    };
  }
}
