import { describe, expect, it } from "vitest";
import {
  calculateSaleReturn,
  projectReturnableSaleLines,
  SaleReturnQuantityError,
} from "./return-policy";
import type { SaleReturnWorkspaceLine } from "./return-schemas";

function line(
  overrides: Partial<SaleReturnWorkspaceLine> = {},
): SaleReturnWorkspaceLine {
  return {
    lineId: "line_1",
    productId: "product_1",
    variantId: "variant_1",
    productName: "Counter Kit",
    variantName: "Default",
    sku: "KIT-1",
    originalQuantity: 3,
    returnedQuantity: 0,
    remainingQuantity: 3,
    unitPriceMinor: 1_000,
    unitCostMinor: 400,
    subtotalMinor: 3_000,
    discountMinor: 100,
    taxMinor: 233,
    lineTotalMinor: 3_133,
    returnedSubtotalMinor: 0,
    returnedDiscountMinor: 0,
    returnedTaxMinor: 0,
    returnedLineTotalMinor: 0,
    inventoryTracking: true,
    levelVersion: 2,
    ...overrides,
  };
}

describe("sale return calculation", () => {
  it("projects remaining quantities and prior financial allocations", () => {
    expect(
      projectReturnableSaleLines(
        [
          {
            lineId: "line_1",
            productId: "product_1",
            variantId: "variant_1",
            productName: "Counter Kit",
            variantName: "Default",
            sku: "KIT-1",
            quantity: 3,
            unitPriceMinor: 1_000,
            unitCostMinor: 400,
            subtotalMinor: 3_000,
            discountMinor: 100,
            taxMinor: 233,
            lineTotalMinor: 3_133,
            inventoryTracking: true,
          },
        ],
        [
          {
            saleLineId: "line_1",
            quantity: 1,
            subtotalMinor: 1_000,
            discountMinor: 33,
            taxMinor: 78,
            lineTotalMinor: 1_045,
          },
        ],
        new Map([["variant_1", 7]]),
      )[0],
    ).toMatchObject({
      returnedQuantity: 1,
      remainingQuantity: 2,
      returnedLineTotalMinor: 1_045,
      levelVersion: 7,
    });
  });

  it("allocates a partial return from immutable sale amounts", () => {
    expect(
      calculateSaleReturn(
        [line()],
        [{ saleLineId: "line_1", quantity: 1, expectedLevelVersion: 2 }],
      ),
    ).toMatchObject({
      subtotalMinor: 1_000,
      discountMinor: 33,
      taxMinor: 78,
      netTotalMinor: 967,
      totalMinor: 1_045,
      grossProfitReversalMinor: 567,
    });
  });

  it("assigns the rounding remainder to the final returned units", () => {
    const final = calculateSaleReturn(
      [
        line({
          returnedQuantity: 1,
          remainingQuantity: 2,
          returnedSubtotalMinor: 1_000,
          returnedDiscountMinor: 33,
          returnedTaxMinor: 78,
          returnedLineTotalMinor: 1_045,
        }),
      ],
      [{ saleLineId: "line_1", quantity: 2, expectedLevelVersion: 3 }],
    );
    expect(final).toMatchObject({
      subtotalMinor: 2_000,
      discountMinor: 67,
      taxMinor: 155,
      totalMinor: 2_088,
    });
    expect(final.totalMinor + 1_045).toBe(3_133);
  });

  it("rejects unknown and over-returned lines", () => {
    expect(() =>
      calculateSaleReturn(
        [line()],
        [{ saleLineId: "missing", quantity: 1, expectedLevelVersion: 2 }],
      ),
    ).toThrow(SaleReturnQuantityError);
    expect(() =>
      calculateSaleReturn(
        [line({ remainingQuantity: 1, returnedQuantity: 2 })],
        [{ saleLineId: "line_1", quantity: 2, expectedLevelVersion: 2 }],
      ),
    ).toThrow(SaleReturnQuantityError);
  });

  it("keeps profit unknown when original cost was unavailable", () => {
    expect(
      calculateSaleReturn(
        [line({ unitCostMinor: null })],
        [{ saleLineId: "line_1", quantity: 1, expectedLevelVersion: 2 }],
      ).grossProfitReversalMinor,
    ).toBeNull();
  });
});
