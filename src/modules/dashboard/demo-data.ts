import { completeTrend, dashboardPeriod, summarizeSales } from "./policy";
import type {
  DashboardOverview,
  DashboardRange,
  DashboardStorePerformance,
} from "./schemas";

const weeklyNetSales = [24_100, 28_400, 26_800, 31_700, 35_900, 43_600, 38_300];
const weeklyProfit = [9_200, 10_900, 10_100, 12_300, 14_100, 17_000, 15_700];

export function getDemoDashboard(
  range: DashboardRange,
  now = new Date(),
): DashboardOverview {
  const timezone = "America/New_York";
  const locale = "en-US";
  const period = dashboardPeriod(range, timezone, now);
  const multiplier = range === "30d" ? 0.82 : 1;
  const rows = period.dateKeys.map((date, index) => {
    const weekIndex = index % weeklyNetSales.length;
    const cycle = range === "30d" ? 0.88 + index * 0.009 : 1;
    return {
      date,
      netSalesMinor: Math.round(
        (weeklyNetSales[weekIndex] ?? 0) * multiplier * cycle * 100,
      ),
      grossProfitMinor: Math.round(
        (weeklyProfit[weekIndex] ?? 0) * multiplier * cycle * 100,
      ),
      completedSales: 150 + weekIndex * 11,
      profitRecordCount: 150 + weekIndex * 11,
    };
  });
  const trend = completeTrend(period, rows, locale, timezone);
  const currentNetSales = trend.reduce(
    (total, point) => total + point.netSalesMinor,
    0,
  );
  const previousNetSales = Math.round(currentNetSales / 1.124);
  const storeMix = [
    { id: "demo-downtown", code: "DT", name: "Downtown", share: 41 },
    { id: "demo-riverside", code: "RV", name: "Riverside", share: 31 },
    { id: "demo-online", code: "WEB", name: "Online", share: 28 },
  ];
  const stores: DashboardStorePerformance[] = storeMix.map((store) => ({
    storeId: store.id,
    storeCode: store.code,
    storeName: store.name,
    netSalesMinor: Math.round((currentNetSales * store.share) / 100),
    completedSales: Math.round((1_284 * store.share) / 100),
    sharePercent: store.share,
  }));

  return {
    businessName: "Northstar Goods",
    firstName: "Avery",
    teamMemberCount: 8,
    currency: "USD",
    locale,
    timezone,
    range,
    rangeLabel: period.label,
    asOf: now.toISOString(),
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    activeStore: { id: "demo-downtown", code: "DT", name: "Downtown" },
    canViewSales: true,
    canViewActivity: true,
    sales: summarizeSales(trend, previousNetSales),
    trend,
    stores,
    activity: [
      {
        id: "demo-sale",
        action: "sale.completed",
        title: "Sale NS-DT-10482 completed",
        summary: "Downtown · $428.00",
        occurredAt: new Date(now.getTime() - 8 * 60 * 1000).toISOString(),
        tone: "success",
      },
      {
        id: "demo-inventory",
        action: "inventory.adjusted",
        title: "Inventory adjusted",
        summary: "Counter Kit reached its reorder threshold.",
        occurredAt: new Date(now.getTime() - 32 * 60 * 1000).toISOString(),
        tone: "warning",
      },
      {
        id: "demo-transfer",
        action: "inventory.transferred",
        title: "Stock transfer completed",
        summary: "Twelve units moved from Downtown to Riverside.",
        occurredAt: new Date(now.getTime() - 51 * 60 * 1000).toISOString(),
        tone: "primary",
      },
    ],
  };
}
