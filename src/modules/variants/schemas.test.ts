import { describe, expect, it } from "vitest";
import {
  createOptionGroupSchema,
  createOptionSignature,
  createVariantSchema,
  normalizeOptionLabel,
  normalizeVariantSku,
  updateOptionGroupSchema,
} from "./schemas";

describe("variant and option schemas", () => {
  it("normalizes labels and SKUs consistently", () => {
    expect(normalizeOptionLabel("  New   Arrival ")).toBe("new arrival");
    expect(normalizeVariantSku(" sku-blue-m ")).toBe("SKU-BLUE-M");
  });

  it("rejects duplicate option labels after normalization", () => {
    expect(() =>
      createOptionGroupSchema.parse({
        productId: "prd_test",
        expectedProductVersion: 1,
        name: "Color",
        values: ["Midnight", " midnight "],
      }),
    ).toThrow("Option values must be unique");
  });

  it("defaults appended values and validates complete variant input", () => {
    expect(
      updateOptionGroupSchema.parse({
        productId: "prd_test",
        optionGroupId: "opt_color",
        expectedProductVersion: 2,
        name: "Finish",
      }).newValues,
    ).toEqual([]);
    expect(
      createVariantSchema.parse({
        productId: "prd_test",
        expectedProductVersion: 2,
        sku: "SKU-BLACK",
        priceMinor: 12_900,
        optionValues: [{ optionId: "opt_color", valueId: "val_black" }],
      }),
    ).toMatchObject({ priceMinor: 12_900 });
  });

  it("creates an order-independent option signature", () => {
    const signature = createOptionSignature([
      { optionId: "opt_size", valueId: "val_medium" },
      { optionId: "opt_color", valueId: "val_black" },
    ]);
    expect(signature).toBe("opt_color:val_black|opt_size:val_medium");
  });
});
