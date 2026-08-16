import {
  buildMethodMix,
  buildStoreContribution,
  completeSalesReportTrend,
  salesReportPeriod,
  summarizeSalesReport,
  type SalesReportDailyReturnRow,
  type SalesReportDailySaleRow,
} from "./sales-policy";
import type {
  SalesReportOverview,
  SalesReportProductContribution,
  SalesReportQuery,
  SalesReportStoreOption,
  SalesReportTransaction,
} from "./sales-schemas";

const stores: SalesReportStoreOption[] = [
  { id: "demo-store", code: "DT", name: "Downtown" },
  { id: "demo-west", code: "WH", name: "West Harbor" },
];

const productNames = [
  "Classic Cotton Kurta",
  "Everyday Canvas Sneakers",
  "Counter Kit",
  "Merino Travel Wrap",
  "Stoneware Serving Set",
  "Weekend Carryall",
];

function scaled(value: number, factor: number): number {
  return Math.round(value * factor);
}

export function getDemoSalesReport(
  query: SalesReportQuery,
  now = new Date(),
): SalesReportOverview {
  const timezone = "Asia/Karachi";
  const locale = "en-PK";
  const period = salesReportPeriod(query.range, timezone, now);
  const requestedStore = stores.find((store) => store.id === query.store);
  const selectedStoreId = requestedStore?.id ?? "all";
  const selectedStores = requestedStore ? [requestedStore] : stores;
  const storeFactor = requestedStore
    ? requestedStore.id === "demo-store"
      ? 0.62
      : 0.38
    : 1;
  const saleRows: SalesReportDailySaleRow[] = period.dateKeys.map(
    (date, index) => {
      const weekdayFactor = index % 7 === 5 || index % 7 === 6 ? 1.24 : 1;
      const growthFactor = 0.86 + index / Math.max(period.days * 5, 1);
      const grossSalesMinor = scaled(
        (165_000 + ((index * 37) % 82_000)) * weekdayFactor * growthFactor,
        storeFactor,
      );
      const discountMinor = Math.round(grossSalesMinor * 0.047);
      const netSalesMinor = grossSalesMinor - discountMinor;
      const completedSales = Math.max(
        1,
        scaled(12 + ((index * 5) % 9), storeFactor),
      );
      return {
        date,
        grossSalesMinor,
        discountMinor,
        netSalesMinor,
        taxMinor: Math.round(netSalesMinor * 0.08),
        grossProfitMinor: Math.round(netSalesMinor * 0.36),
        completedSales,
        unitsSold: Math.round(completedSales * 1.7),
        profitRecordCount: completedSales,
      };
    },
  );
  const returnRows: SalesReportDailyReturnRow[] = period.dateKeys
    .filter((_, index) => index % 6 === 2)
    .map((date, index) => {
      const returnNetMinor = scaled(21_000 + index * 3_700, storeFactor);
      return {
        date,
        returnNetMinor,
        refundTotalMinor: Math.round(returnNetMinor * 1.08),
        returnTaxMinor: Math.round(returnNetMinor * 0.08),
        grossProfitReversalMinor: Math.round(returnNetMinor * 0.36),
        completedReturns: 1,
        unitsReturned: 1 + (index % 2),
        profitRecordCount: 1,
      };
    });
  const trend = completeSalesReportTrend(
    period,
    saleRows,
    returnRows,
    locale,
    timezone,
  );
  const summary = summarizeSalesReport(trend);
  const downtownNet = Math.round(summary.netSalesMinor * 0.62);
  const westNet = summary.netSalesMinor - downtownNet;
  const storeContribution = buildStoreContribution(
    selectedStores,
    selectedStores.map((store) => {
      const factor = store.id === "demo-store" ? 0.62 : 0.38;
      return {
        storeId: store.id,
        grossSalesMinor: Math.round(
          summary.grossSalesMinor * (requestedStore ? 1 : factor),
        ),
        netSalesMinor: requestedStore
          ? summary.netSalesMinor + summary.returnNetMinor
          : (store.id === "demo-store" ? downtownNet : westNet) +
            Math.round(summary.returnNetMinor * factor),
        completedSales: Math.round(
          summary.completedSales * (requestedStore ? 1 : factor),
        ),
      };
    }),
    selectedStores.map((store) => {
      const factor = store.id === "demo-store" ? 0.62 : 0.38;
      return {
        storeId: store.id,
        returnNetMinor: Math.round(
          summary.returnNetMinor * (requestedStore ? 1 : factor),
        ),
        completedReturns: Math.round(
          summary.completedReturns * (requestedStore ? 1 : factor),
        ),
      };
    }),
  );
  const weights = [0.27, 0.21, 0.17, 0.14, 0.12, 0.09];
  const productContribution: SalesReportProductContribution[] =
    productNames.map((productName, index) => {
      const weight = weights[index] ?? 0;
      const grossSalesMinor = Math.round(summary.grossSalesMinor * weight);
      const returnNetMinor = Math.round(
        summary.returnNetMinor * (index === 1 ? 0.31 : weight * 0.82),
      );
      const netSalesMinor =
        Math.round(grossSalesMinor - grossSalesMinor * 0.047) - returnNetMinor;
      return {
        productId: `demo-product-${index + 1}`,
        productName,
        unitsSold: Math.max(1, Math.round(summary.unitsSold * weight)),
        unitsReturned: Math.round(summary.unitsReturned * weight),
        grossSalesMinor,
        returnNetMinor,
        netSalesMinor,
        grossProfitMinor: Math.round(netSalesMinor * 0.36),
      };
    });
  const allTransactions: SalesReportTransaction[] = Array.from(
    { length: Math.min(24, period.days * 2) },
    (_, index) => {
      const isReturn = index > 0 && index % 5 === 0;
      const store = selectedStores[index % selectedStores.length] ?? {
        id: "demo-store",
        code: "DT",
        name: "Downtown",
      };
      const occurredAt = new Date(now);
      occurredAt.setUTCDate(now.getUTCDate() - Math.floor(index / 2));
      return {
        id: `demo-event-${index + 1}`,
        type: isReturn ? "return" : "sale",
        reference: isReturn
          ? `${store.code}-R-${String(84 - index).padStart(6, "0")}`
          : `${store.code}-${String(4_320 - index).padStart(6, "0")}`,
        relatedReference: isReturn
          ? `${store.code}-${String(4_260 - index).padStart(6, "0")}`
          : "",
        saleId: `demo-sale-${index + 1}`,
        storeId: store.id,
        storeName: store.name,
        customerName: isReturn
          ? "Original sale"
          : index % 3 === 0
            ? "Walk-in customer"
            : (["Mira Cole", "Northline Studio", "Owen Reed"][index % 3] ??
              "Walk-in customer"),
        amountMinor: isReturn
          ? 18_900 + index * 420
          : 43_500 + ((index * 7_300) % 91_000),
        netAmountMinor: isReturn
          ? 17_500 + index * 390
          : 40_200 + ((index * 6_800) % 84_000),
        occurredAt: occurredAt.toISOString(),
      };
    },
  );
  const start = (query.page - 1) * query.pageSize;
  return {
    businessName: "Northstar Goods",
    currency: "PKR",
    locale,
    timezone,
    range: query.range,
    rangeLabel: period.label,
    asOf: now.toISOString(),
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    selectedStoreId,
    stores,
    summary,
    trend,
    paymentMethods: buildMethodMix([
      {
        method: "card",
        count: Math.round(summary.completedSales * 0.48),
        amountMinor: Math.round(
          (summary.netSalesMinor + summary.taxMinor) * 0.52,
        ),
      },
      {
        method: "cash",
        count: Math.round(summary.completedSales * 0.34),
        amountMinor: Math.round(
          (summary.netSalesMinor + summary.taxMinor) * 0.29,
        ),
      },
      {
        method: "mobile_wallet",
        count: Math.round(summary.completedSales * 0.18),
        amountMinor: Math.round(
          (summary.netSalesMinor + summary.taxMinor) * 0.19,
        ),
      },
    ]),
    refundMethods: buildMethodMix([
      {
        method: "card",
        count: Math.ceil(summary.completedReturns * 0.54),
        amountMinor: Math.round(summary.refundTotalMinor * 0.58),
      },
      {
        method: "cash",
        count: Math.floor(summary.completedReturns * 0.46),
        amountMinor:
          summary.refundTotalMinor -
          Math.round(summary.refundTotalMinor * 0.58),
      },
    ]),
    storeContribution,
    productContribution,
    transactions: {
      items: allTransactions.slice(start, start + query.pageSize),
      total: allTransactions.length,
      page: query.page,
      pageSize: query.pageSize,
    },
  };
}
