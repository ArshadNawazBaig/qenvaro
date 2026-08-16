import { describe, expect, it } from "vitest";
import {
  createUnitSchema,
  createUnitSlug,
  normalizeUnitValue,
  unitListQuerySchema,
} from "./schemas";

describe("unit schemas", () => {
  it("normalizes compatible names and symbols for tenant uniqueness", () => {
    expect(normalizeUnitValue("  KILOGram  ")).toBe("kilogram");
    expect(normalizeUnitValue("ＫＧ")).toBe("kg");
  });

  it("validates bounded unit input", () => {
    expect(
      createUnitSchema.parse({
        name: "Kilogram",
        symbol: "kg",
        description: "Stock measured by weight.",
      }),
    ).toEqual({
      name: "Kilogram",
      symbol: "kg",
      description: "Stock measured by weight.",
    });
    expect(
      createUnitSchema.safeParse({ name: "x", symbol: "", description: "" })
        .success,
    ).toBe(false);
  });

  it("creates stable slugs and safe list defaults", () => {
    expect(createUnitSlug("Square metre", "uom_1234567890")).toBe(
      "square-metre-34567890",
    );
    expect(unitListQuerySchema.parse({ page: "bad", pageSize: "500" })).toEqual(
      {
        q: "",
        page: 1,
        pageSize: 10,
        status: "all",
        sort: "name",
        direction: "asc",
      },
    );
  });
});
