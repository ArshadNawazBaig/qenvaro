import { rowsToCsv } from "@/modules/products/csv";
import type { SalesReportOverview } from "@/modules/reports/sales-schemas";

function minorAmount(value: number | null): string | null {
  return value === null ? null : (value / 100).toFixed(2);
}

export function buildSalesReportCsv(report: SalesReportOverview): {
  csv: string;
  rowCount: number;
} {
  const selectedStore =
    report.selectedStoreId === "all"
      ? "All assigned stores"
      : (report.stores.find((store) => store.id === report.selectedStoreId)
          ?.name ?? "Selected store");
  const rows: Array<Array<string | number | null>> = [
    [
      "date",
      "business",
      "store_filter",
      "gross_sales",
      "discounts",
      "returned_net_value",
      "refunds_including_tax",
      "net_sales",
      "net_tax",
      "gross_profit",
      "completed_orders",
      "processed_returns",
      "units_sold",
      "units_returned",
      "currency",
    ],
    ...report.trend.map((point) => [
      point.date,
      report.businessName,
      selectedStore,
      minorAmount(point.grossSalesMinor),
      minorAmount(point.discountMinor),
      minorAmount(point.returnNetMinor),
      minorAmount(point.refundTotalMinor),
      minorAmount(point.netSalesMinor),
      minorAmount(point.taxMinor),
      minorAmount(point.grossProfitMinor),
      point.completedSales,
      point.completedReturns,
      point.unitsSold,
      point.unitsReturned,
      report.currency,
    ]),
  ];
  return { csv: rowsToCsv(rows), rowCount: report.trend.length };
}
