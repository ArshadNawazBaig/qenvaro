import { describe, expect, it } from "vitest";
import {
  archiveCategorySchema,
  normalizeCategoryName,
  updateCategorySchema,
} from "@/modules/categories/schemas";

const validUpdate = {
  categoryId: "cat_hardware",
  expectedVersion: 2,
  name: "Retail Hardware",
  description: "Devices and counter fixtures.",
};

describe("category schemas", () => {
  it("normalizes compatible names for tenant uniqueness", () => {
    expect(normalizeCategoryName("  RETAIL   Hardware ")).toBe(
      "retail hardware",
    );
  });

  it("accepts a bounded category update", () => {
    expect(updateCategorySchema.parse(validUpdate)).toEqual(validUpdate);
  });

  it("rejects tenant and product-assignment fields", () => {
    expect(() =>
      updateCategorySchema.parse({
        ...validUpdate,
        tenantId: "org_other",
        activeProductCount: 0,
      }),
    ).toThrow();
  });

  it("requires a positive version for archive", () => {
    expect(() =>
      archiveCategorySchema.parse({
        categoryId: validUpdate.categoryId,
        expectedVersion: 0,
      }),
    ).toThrow();
  });
});
