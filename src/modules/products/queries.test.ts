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
});
