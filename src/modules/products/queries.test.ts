import { describe, expect, it } from "vitest";
import { queryDemoProducts } from "./queries";

describe("product list query", () => {
  it("bounds page sizes and filters without exposing arbitrary operators", () => {
    const result = queryDemoProducts({
      q: "GS-ANNUAL",
      pageSize: "500",
      status: '{"$ne":"archived"}',
    });
    expect(result.query.pageSize).toBe(8);
    expect(result.query.status).toBe("all");
    expect(result.items).toHaveLength(1);
  });
  it("keeps pagination stable", () => {
    const result = queryDemoProducts({ page: "99", pageSize: "5" });
    expect(result.page).toBe(result.pageCount);
    expect(result.items.length).toBeGreaterThan(0);
  });
  it("filters products by stable tag identifier", () => {
    const result = queryDemoProducts({ tag: "tag_low_margin" });
    expect(result.items.map((product) => product.id)).toEqual([
      "prd_analytics",
      "prd_receipts",
    ]);
    expect(result.items.every((product) => product.tagIds.length > 0)).toBe(
      true,
    );
  });
});
