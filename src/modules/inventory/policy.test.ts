import { describe, expect, it } from "vitest";
import {
  adjustmentDelta,
  adjustmentMovementType,
  effectiveStoreAvailability,
  lowStockSeverity,
  mergeScopedStoreAvailability,
  projectedQuantity,
} from "./policy";
import {
  createStockAdjustmentSchema,
  createStockTransferSchema,
} from "./schemas";

describe("inventory policy", () => {
  it("computes increases, decreases, and exact counts", () => {
    expect(adjustmentDelta("increase", 4, 10)).toBe(4);
    expect(adjustmentDelta("decrease", 4, 10)).toBe(-4);
    expect(adjustmentDelta("set", 4, 10)).toBe(-6);
  });

  it("maps adjustment reasons to durable movement types", () => {
    expect(adjustmentMovementType("damaged")).toBe("damaged");
    expect(adjustmentMovementType("expired")).toBe("expired");
    expect(adjustmentMovementType("cycle_count")).toBe("correction");
    expect(adjustmentMovementType("other_receipt")).toBe("manual_adjustment");
  });

  it("blocks negative projected stock unless explicitly enabled", () => {
    expect(() => projectedQuantity(2, -3, false)).toThrow(
      "Inventory cannot fall below zero.",
    );
    expect(projectedQuantity(2, -3, true)).toBe(-1);
  });

  it("validates adjustment reason direction", () => {
    const base = {
      storeId: "store_main",
      variantId: "variant_one",
      quantity: 2,
      note: "Counted on shelf",
      expectedLevelVersion: 1,
      idempotencyKey: "adjustment:test",
    };
    expect(
      createStockAdjustmentSchema.safeParse({
        ...base,
        mode: "increase",
        reason: "damaged",
      }).success,
    ).toBe(false);
    expect(
      createStockAdjustmentSchema.safeParse({
        ...base,
        mode: "decrease",
        reason: "damaged",
      }).success,
    ).toBe(true);
  });

  it("requires distinct stores and unique transfer SKUs", () => {
    const parsed = createStockTransferSchema.safeParse({
      fromStoreId: "store_main",
      toStoreId: "store_main",
      note: "Replenishment run",
      idempotencyKey: "transfer:test",
      lines: [
        {
          variantId: "variant_one",
          quantity: 2,
          expectedSourceVersion: 1,
          expectedDestinationVersion: 0,
        },
        {
          variantId: "variant_one",
          quantity: 1,
          expectedSourceVersion: 1,
          expectedDestinationVersion: 0,
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("resolves implicit all-store availability and preserves hidden scope", () => {
    expect(
      effectiveStoreAvailability([], ["main", "warehouse", "remote"]),
    ).toEqual(["main", "warehouse", "remote"]);
    expect(
      mergeScopedStoreAvailability(
        ["main", "warehouse", "remote"],
        new Set(["main", "warehouse"]),
        ["warehouse"],
        ["main", "warehouse", "remote"],
      ),
    ).toEqual(["warehouse", "remote"]);
  });

  it("derives enabled low and out-of-stock severities", () => {
    const preferences = {
      enabled: true,
      includeLowStock: true,
      includeOutOfStock: true,
      version: 1,
    };
    expect(lowStockSeverity(0, 5, preferences)).toBe("out");
    expect(lowStockSeverity(3, 5, preferences)).toBe("low");
    expect(lowStockSeverity(8, 5, preferences)).toBeNull();
    expect(
      lowStockSeverity(0, 5, { ...preferences, enabled: false }),
    ).toBeNull();
  });
});
