import { describe, expect, it } from "vitest";
import {
  buildMethodMix,
  buildStoreContribution,
  completeSalesReportTrend,
  salesReportPeriod,
  summarizeSalesReport,
} from "./sales-policy";

describe("sales reporting policy", () => {
  it("builds 90 tenant-local calendar days across daylight-saving changes", () => {
    const period = salesReportPeriod(
      "90d",
      "America/New_York",
      new Date("2026-03-10T15:00:00.000Z"),
    );
    expect(period.dateKeys).toHaveLength(90);
    expect(period.dateKeys.at(-1)).toBe("2026-03-10");
    expect(period.start.toISOString()).toBe("2025-12-11T05:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-03-11T04:00:00.000Z");
  });

  it("subtracts returns by their processing date and preserves complete profit", () => {
    const period = salesReportPeriod(
      "7d",
      "UTC",
      new Date("2026-08-17T12:00:00.000Z"),
    );
    const trend = completeSalesReportTrend(
      period,
      [
        {
          date: "2026-08-17",
          grossSalesMinor: 12_000,
          discountMinor: 2_000,
          netSalesMinor: 10_000,
          taxMinor: 1_500,
          grossProfitMinor: 4_000,
          completedSales: 2,
          unitsSold: 3,
          profitRecordCount: 2,
        },
      ],
      [
        {
          date: "2026-08-16",
          returnNetMinor: 2_500,
          refundTotalMinor: 2_875,
          returnTaxMinor: 375,
          grossProfitReversalMinor: 900,
          completedReturns: 1,
          unitsReturned: 1,
          profitRecordCount: 1,
        },
      ],
      "en-US",
      "UTC",
    );
    expect(trend.find((point) => point.date === "2026-08-16")).toMatchObject({
      netSalesMinor: -2_500,
      grossProfitMinor: -900,
    });
    expect(summarizeSalesReport(trend)).toMatchObject({
      grossSalesMinor: 12_000,
      discountMinor: 2_000,
      returnNetMinor: 2_500,
      refundTotalMinor: 2_875,
      netSalesMinor: 7_500,
      taxMinor: 1_125,
      grossProfitMinor: 3_100,
      completedSales: 2,
      completedReturns: 1,
      averageOrderMinor: 3_750,
    });
  });

  it("suppresses profit and margin when a sale or return lacks cost evidence", () => {
    const period = salesReportPeriod(
      "7d",
      "UTC",
      new Date("2026-08-17T12:00:00.000Z"),
    );
    const trend = completeSalesReportTrend(
      period,
      [
        {
          date: "2026-08-17",
          grossSalesMinor: 5_000,
          discountMinor: 0,
          netSalesMinor: 5_000,
          taxMinor: 0,
          grossProfitMinor: 0,
          completedSales: 1,
          unitsSold: 1,
          profitRecordCount: 0,
        },
      ],
      [],
      "en-US",
      "UTC",
    );
    expect(summarizeSalesReport(trend)).toMatchObject({
      grossProfitMinor: null,
      marginPercent: null,
    });
  });

  it("calculates deterministic payment shares and store contribution", () => {
    expect(
      buildMethodMix([
        { method: "cash", count: 2, amountMinor: 7_500 },
        { method: "card", count: 1, amountMinor: 2_500 },
      ]),
    ).toEqual([
      { method: "cash", count: 2, amountMinor: 7_500, sharePercent: 75 },
      { method: "card", count: 1, amountMinor: 2_500, sharePercent: 25 },
    ]);
    expect(
      buildStoreContribution(
        [
          { id: "store-a", code: "A", name: "Alpha" },
          { id: "store-b", code: "B", name: "Beta" },
        ],
        [
          {
            storeId: "store-a",
            grossSalesMinor: 10_000,
            netSalesMinor: 9_000,
            completedSales: 2,
          },
          {
            storeId: "store-b",
            grossSalesMinor: 5_000,
            netSalesMinor: 5_000,
            completedSales: 1,
          },
        ],
        [
          {
            storeId: "store-a",
            returnNetMinor: 1_500,
            completedReturns: 1,
          },
        ],
      ),
    ).toEqual([
      expect.objectContaining({
        id: "store-a",
        netSalesMinor: 7_500,
        sharePercent: 60,
      }),
      expect.objectContaining({
        id: "store-b",
        netSalesMinor: 5_000,
        sharePercent: 40,
      }),
    ]);
  });
});
