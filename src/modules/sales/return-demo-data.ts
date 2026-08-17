import type {
  SaleHistoryItem,
  SalesHistoryQuery,
  SalesHistoryResult,
} from "./return-schemas";

const demoSales: SaleHistoryItem[] = [
  {
    id: "sale_demo_1",
    receiptNumber: "DT-004281",
    storeName: "Downtown",
    customerName: "Mira Cole",
    lineCount: 2,
    unitCount: 3,
    currency: "USD",
    totalMinor: 24_800,
    returnedTotalMinor: 0,
    status: "completed",
    completedAt: "2026-08-17T09:40:00.000Z",
  },
  {
    id: "sale_demo_2",
    receiptNumber: "DT-004280",
    storeName: "Downtown",
    customerName: "Walk-in customer",
    lineCount: 1,
    unitCount: 1,
    currency: "USD",
    totalMinor: 7_800,
    returnedTotalMinor: 2_600,
    status: "completed",
    completedAt: "2026-08-17T08:15:00.000Z",
  },
  {
    id: "sale_demo_3",
    receiptNumber: "WH-001143",
    storeName: "West Harbor",
    customerName: "Northline Studio",
    lineCount: 3,
    unitCount: 5,
    currency: "USD",
    totalMinor: 19_900,
    returnedTotalMinor: 19_900,
    status: "completed",
    completedAt: "2026-08-16T14:20:00.000Z",
  },
];

export function getDemoSalesHistory(
  query: SalesHistoryQuery,
): SalesHistoryResult {
  const needle = query.q.toLowerCase();
  const filtered = demoSales.filter(
    (sale) =>
      !needle ||
      sale.receiptNumber.toLowerCase().includes(needle) ||
      sale.customerName.toLowerCase().includes(needle),
  );
  const start = (query.page - 1) * query.pageSize;
  return {
    items: filtered.slice(start, start + query.pageSize),
    total: filtered.length,
    page: query.page,
    pageSize: query.pageSize,
    currency: "USD",
    locale: "en-US",
    timezone: "UTC",
  };
}
