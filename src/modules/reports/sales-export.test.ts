import { describe, expect, it } from "vitest";
import { getDemoSalesReport } from "@/modules/reports/sales-demo-data";
import { buildSalesReportCsv } from "@/modules/reports/sales-export";
import { salesReportQuerySchema } from "@/modules/reports/sales-schemas";

describe("sales report CSV", () => {
  it("creates a spreadsheet-safe daily fact table", () => {
    const report = getDemoSalesReport(
      salesReportQuerySchema.parse({ range: "7d", store: "all" }),
    );
    report.businessName = "=UNSAFE()";
    const result = buildSalesReportCsv(report);

    expect(result.rowCount).toBe(7);
    expect(result.csv.split("\r\n")).toHaveLength(8);
    expect(result.csv).toContain("date,business,store_filter,gross_sales");
    expect(result.csv).toContain("'=UNSAFE()");
    expect(result.csv).toContain(report.currency);
  });
});
