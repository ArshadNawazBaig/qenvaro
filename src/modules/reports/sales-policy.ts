import {
  calendarDateToUtc,
  tenantCalendarPeriod,
  type TenantCalendarPeriod,
} from "@/lib/tenant-period";
import type { SalePaymentMethod } from "@/modules/sales/schemas";
import type {
  SalesReportMethodMix,
  SalesReportRange,
  SalesReportStoreContribution,
  SalesReportSummary,
  SalesReportTrendPoint,
} from "./sales-schemas";

export interface SalesReportDailySaleRow {
  date: string;
  grossSalesMinor: number;
  discountMinor: number;
  netSalesMinor: number;
  taxMinor: number;
  grossProfitMinor: number;
  completedSales: number;
  unitsSold: number;
  profitRecordCount: number;
}

export interface SalesReportDailyReturnRow {
  date: string;
  returnNetMinor: number;
  refundTotalMinor: number;
  returnTaxMinor: number;
  grossProfitReversalMinor: number;
  completedReturns: number;
  unitsReturned: number;
  profitRecordCount: number;
}

export interface SalesReportStoreRow {
  storeId: string;
  grossSalesMinor?: number;
  netSalesMinor?: number;
  returnNetMinor?: number;
  completedSales?: number;
  completedReturns?: number;
}

export function salesReportPeriod(
  range: SalesReportRange,
  timezone: string,
  now = new Date(),
): TenantCalendarPeriod {
  const days = range === "90d" ? 90 : range === "30d" ? 30 : 7;
  return tenantCalendarPeriod(days, timezone, now);
}

export function completeSalesReportTrend(
  period: TenantCalendarPeriod,
  saleRows: readonly SalesReportDailySaleRow[],
  returnRows: readonly SalesReportDailyReturnRow[],
  locale: string,
  timezone: string,
): SalesReportTrendPoint[] {
  const salesByDate = new Map(saleRows.map((row) => [row.date, row]));
  const returnsByDate = new Map(returnRows.map((row) => [row.date, row]));
  const labelFormat = new Intl.DateTimeFormat(locale, {
    month: period.days > 7 ? "numeric" : "short",
    day: "numeric",
    timeZone: timezone,
  });
  return period.dateKeys.map((date) => {
    const sales = salesByDate.get(date);
    const returns = returnsByDate.get(date);
    const saleNetMinor = sales?.netSalesMinor ?? 0;
    const returnNetMinor = returns?.returnNetMinor ?? 0;
    const profitComplete =
      (sales?.completedSales ?? 0) === (sales?.profitRecordCount ?? 0) &&
      (returns?.completedReturns ?? 0) === (returns?.profitRecordCount ?? 0);
    const labelInstant = calendarDateToUtc(
      {
        year: Number(date.slice(0, 4)),
        month: Number(date.slice(5, 7)),
        day: Number(date.slice(8, 10)),
      },
      timezone,
    );
    return {
      date,
      label: labelFormat.format(labelInstant),
      grossSalesMinor: sales?.grossSalesMinor ?? 0,
      discountMinor: sales?.discountMinor ?? 0,
      returnNetMinor,
      refundTotalMinor: returns?.refundTotalMinor ?? 0,
      netSalesMinor: saleNetMinor - returnNetMinor,
      taxMinor: (sales?.taxMinor ?? 0) - (returns?.returnTaxMinor ?? 0),
      grossProfitMinor: profitComplete
        ? (sales?.grossProfitMinor ?? 0) -
          (returns?.grossProfitReversalMinor ?? 0)
        : null,
      completedSales: sales?.completedSales ?? 0,
      completedReturns: returns?.completedReturns ?? 0,
      unitsSold: sales?.unitsSold ?? 0,
      unitsReturned: returns?.unitsReturned ?? 0,
    };
  });
}

export function summarizeSalesReport(
  trend: readonly SalesReportTrendPoint[],
): SalesReportSummary {
  const totals = trend.reduce(
    (summary, point) => ({
      grossSalesMinor: summary.grossSalesMinor + point.grossSalesMinor,
      discountMinor: summary.discountMinor + point.discountMinor,
      returnNetMinor: summary.returnNetMinor + point.returnNetMinor,
      refundTotalMinor: summary.refundTotalMinor + point.refundTotalMinor,
      netSalesMinor: summary.netSalesMinor + point.netSalesMinor,
      taxMinor: summary.taxMinor + point.taxMinor,
      completedSales: summary.completedSales + point.completedSales,
      completedReturns: summary.completedReturns + point.completedReturns,
      unitsSold: summary.unitsSold + point.unitsSold,
      unitsReturned: summary.unitsReturned + point.unitsReturned,
    }),
    {
      grossSalesMinor: 0,
      discountMinor: 0,
      returnNetMinor: 0,
      refundTotalMinor: 0,
      netSalesMinor: 0,
      taxMinor: 0,
      completedSales: 0,
      completedReturns: 0,
      unitsSold: 0,
      unitsReturned: 0,
    },
  );
  const profitComplete = trend.every(
    (point) => point.grossProfitMinor !== null,
  );
  const grossProfitMinor = profitComplete
    ? trend.reduce((sum, point) => sum + (point.grossProfitMinor ?? 0), 0)
    : null;
  return {
    ...totals,
    grossProfitMinor,
    averageOrderMinor:
      totals.completedSales === 0
        ? 0
        : Math.round(totals.netSalesMinor / totals.completedSales),
    marginPercent:
      totals.netSalesMinor <= 0 || grossProfitMinor === null
        ? null
        : (grossProfitMinor / totals.netSalesMinor) * 100,
  };
}

export function buildMethodMix(
  rows: readonly {
    method: SalePaymentMethod;
    count: number;
    amountMinor: number;
  }[],
): SalesReportMethodMix[] {
  const total = rows.reduce((sum, row) => sum + row.amountMinor, 0);
  return [...rows]
    .sort(
      (left, right) =>
        right.amountMinor - left.amountMinor ||
        left.method.localeCompare(right.method),
    )
    .map((row) => ({
      ...row,
      sharePercent: total === 0 ? 0 : (row.amountMinor / total) * 100,
    }));
}

export function buildStoreContribution(
  stores: readonly { id: string; code: string; name: string }[],
  saleRows: readonly SalesReportStoreRow[],
  returnRows: readonly SalesReportStoreRow[],
): SalesReportStoreContribution[] {
  const salesByStore = new Map(saleRows.map((row) => [row.storeId, row]));
  const returnsByStore = new Map(returnRows.map((row) => [row.storeId, row]));
  const rows = stores.map((store) => {
    const sale = salesByStore.get(store.id);
    const returned = returnsByStore.get(store.id);
    const grossSalesMinor = sale?.grossSalesMinor ?? 0;
    const returnNetMinor = returned?.returnNetMinor ?? 0;
    return {
      ...store,
      grossSalesMinor,
      returnNetMinor,
      netSalesMinor: (sale?.netSalesMinor ?? grossSalesMinor) - returnNetMinor,
      completedSales: sale?.completedSales ?? 0,
      completedReturns: returned?.completedReturns ?? 0,
      sharePercent: 0,
    };
  });
  const positiveNetTotal = rows.reduce(
    (sum, row) => sum + Math.max(0, row.netSalesMinor),
    0,
  );
  return rows
    .map((row) => ({
      ...row,
      sharePercent:
        positiveNetTotal === 0
          ? 0
          : (Math.max(0, row.netSalesMinor) / positiveNetTotal) * 100,
    }))
    .sort(
      (left, right) =>
        right.netSalesMinor - left.netSalesMinor ||
        left.name.localeCompare(right.name),
    );
}
