import { describe, expect, it } from "vitest";
import { queryDemoCategories } from "@/modules/categories/demo-data";
import { categoryListQuerySchema } from "@/modules/categories/schemas";

describe("demo category query", () => {
  it("filters category names and descriptions", () => {
    const result = queryDemoCategories(
      categoryListQuerySchema.parse({ q: "hardware", pageSize: 10 }),
    );
    expect(result.items.map((category) => category.name)).toEqual(["Hardware"]);
  });

  it("sorts by active product assignments", () => {
    const result = queryDemoCategories(
      categoryListQuerySchema.parse({
        sort: "products",
        direction: "desc",
        pageSize: 10,
      }),
    );
    expect(result.items[0]?.activeProductCount).toBeGreaterThanOrEqual(
      result.items[1]?.activeProductCount ?? 0,
    );
  });
});
