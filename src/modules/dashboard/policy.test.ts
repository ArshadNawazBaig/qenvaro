import { describe, expect, it } from "vitest";
import {
  completeTrend,
  dashboardActivityTitle,
  dashboardActivityTone,
  dashboardPeriod,
  summarizeSales,
} from "./policy";

describe("dashboard policy", () => {
  it("builds bounded calendar periods in the tenant timezone", () => {
    const period = dashboardPeriod(
      "7d",
      "America/New_York",
      new Date("2026-08-16T12:00:00.000Z"),
    );

    expect(period.dateKeys).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ]);
    expect(period.start.toISOString()).toBe("2026-08-10T04:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-08-17T04:00:00.000Z");
    expect(period.previousStart.toISOString()).toBe("2026-08-03T04:00:00.000Z");
  });

  it.each([
    ["30d", 30],
    ["90d", 90],
    ["120d", 120],
  ] as const)("supports the %s dashboard reporting period", (range, days) => {
    const period = dashboardPeriod(
      range,
      "UTC",
      new Date("2026-08-16T12:00:00.000Z"),
    );

    expect(period.days).toBe(days);
    expect(period.dateKeys).toHaveLength(days);
    expect(period.label).toBe(`Last ${days} days`);
  });

  it("fills missing trend days and keeps incomplete profit honest", () => {
    const period = dashboardPeriod(
      "7d",
      "UTC",
      new Date("2026-08-16T12:00:00.000Z"),
    );
    const trend = completeTrend(
      period,
      [
        {
          date: "2026-08-15",
          netSalesMinor: 20_000,
          grossProfitMinor: 8_000,
          completedSales: 2,
          profitRecordCount: 1,
        },
      ],
      "en-US",
      "UTC",
    );

    expect(trend).toHaveLength(7);
    expect(trend[5]).toMatchObject({
      date: "2026-08-15",
      netSalesMinor: 20_000,
      grossProfitMinor: null,
      completedSales: 2,
    });
    expect(trend[6]).toMatchObject({
      date: "2026-08-16",
      netSalesMinor: 0,
      grossProfitMinor: 0,
    });
  });

  it("derives totals without inventing previous-period growth", () => {
    const summary = summarizeSales(
      [
        {
          date: "2026-08-15",
          label: "Aug 15",
          netSalesMinor: 12_000,
          grossProfitMinor: 4_000,
          completedSales: 2,
        },
        {
          date: "2026-08-16",
          label: "Aug 16",
          netSalesMinor: 8_000,
          grossProfitMinor: 3_000,
          completedSales: 1,
        },
      ],
      0,
    );

    expect(summary).toEqual({
      netSalesMinor: 20_000,
      grossProfitMinor: 7_000,
      completedSales: 3,
      averageOrderMinor: 6_667,
      marginPercent: 35,
      changePercent: null,
    });
  });

  it("maps allow-listed events to calm dashboard labels and tones", () => {
    expect(dashboardActivityTitle("inventory.transferred")).toBe(
      "Stock transfer completed",
    );
    expect(dashboardActivityTone("inventory.transferred")).toBe("success");
    expect(dashboardActivityTone("product.archived")).toBe("warning");
  });
});
