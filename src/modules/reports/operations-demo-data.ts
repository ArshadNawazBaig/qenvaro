import {
  demoExpenses,
  demoPurchaseOrders,
} from "@/modules/purchasing/demo-data";
import type { OperationsReportQuery } from "@/modules/reports/operations-schemas";
import type { OperationsSummary } from "@/server/repositories/purchasing";

export function getDemoOperationsSummary(
  query: OperationsReportQuery,
  now = new Date("2026-08-17T12:00:00.000Z"),
): OperationsSummary {
  const demoStoreIds = new Set(["demo-store", "demo-west"]);
  const selectedStoreId =
    query.store === "all" || demoStoreIds.has(query.store)
      ? query.store
      : "all";
  const days = query.range === "30d" ? 30 : query.range === "365d" ? 365 : 90;
  const periodStart = new Date(now.getTime() - days * 86_400_000);
  const expenses = demoExpenses.filter(
    (expense) =>
      (selectedStoreId === "all" || expense.storeId === selectedStoreId) &&
      expense.expenseDate >= periodStart.toISOString().slice(0, 10),
  );
  const purchases = demoPurchaseOrders.filter(
    (purchase) =>
      (selectedStoreId === "all" || purchase.storeId === selectedStoreId) &&
      new Date(purchase.createdAt) >= periodStart,
  );
  const approved = expenses.filter((expense) => expense.status === "approved");

  return {
    approvedExpenseMinor: approved.reduce(
      (sum, expense) => sum + expense.amountMinor,
      0,
    ),
    submittedExpenseMinor: expenses
      .filter((expense) => expense.status === "submitted")
      .reduce((sum, expense) => sum + expense.amountMinor, 0),
    receivedPurchaseMinor:
      selectedStoreId === "all" || selectedStoreId === "demo-west"
        ? 4_920_000
        : 0,
    openPurchaseMinor: purchases.reduce(
      (sum, purchase) => sum + purchase.totalMinor,
      0,
    ),
    expenseCount: expenses.length,
    receiptCount:
      selectedStoreId === "all" || selectedStoreId === "demo-west" ? 1 : 0,
    currency: "PKR",
    expenseCategories: approved.map((expense) => ({
      name: expense.category,
      amountMinor: expense.amountMinor,
    })),
    stores: [
      { id: "demo-store", name: "Downtown" },
      { id: "demo-west", name: "West Harbor" },
    ],
    range: query.range,
    selectedStoreId,
    periodStart: periodStart.toISOString(),
    asOf: now.toISOString(),
  };
}
