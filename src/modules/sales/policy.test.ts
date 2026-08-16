import { describe, expect, it } from "vitest";
import {
  allocateSalePayments,
  calculateSale,
  SaleCalculationError,
  SalePaymentMismatchError,
} from "./policy";

describe("sale calculation policy", () => {
  const line = {
    variantId: "var_one",
    productId: "prd_one",
    productName: "Counter kit",
    variantName: "Default",
    sku: "KIT-1",
    quantity: 2,
    discountBps: 1_000,
    expectedLevelVersion: 1,
    unitPriceMinor: 1_000,
    unitCostMinor: 400,
    taxRateBps: 1_500,
    inventoryTracking: true,
  };

  it("calculates discounts, taxes, totals, and profit from resolved prices", () => {
    expect(calculateSale([line])).toMatchObject({
      subtotalMinor: 2_000,
      discountMinor: 200,
      taxMinor: 270,
      netTotalMinor: 1_800,
      totalMinor: 2_070,
      grossProfitMinor: 1_000,
      lines: [
        {
          subtotalMinor: 2_000,
          discountMinor: 200,
          taxMinor: 270,
          lineTotalMinor: 2_070,
        },
      ],
    });
  });

  it("suppresses sale profit when any cost snapshot is unavailable", () => {
    expect(
      calculateSale([{ ...line, unitCostMinor: null }]).grossProfitMinor,
    ).toBe(null);
  });

  it("rejects unsafe arithmetic", () => {
    expect(() =>
      calculateSale([
        { ...line, unitPriceMinor: Number.MAX_SAFE_INTEGER, quantity: 2 },
      ]),
    ).toThrow(SaleCalculationError);
  });

  it("allocates split payments and permits change only from final cash", () => {
    expect(
      allocateSalePayments(2_070, [
        { method: "card", tenderedMinor: 1_000 },
        { method: "cash", tenderedMinor: 1_500 },
      ]),
    ).toEqual({
      payments: [
        { method: "card", tenderedMinor: 1_000, appliedMinor: 1_000 },
        { method: "cash", tenderedMinor: 1_500, appliedMinor: 1_070 },
      ],
      tenderedMinor: 2_500,
      changeMinor: 430,
    });
    expect(() =>
      allocateSalePayments(2_070, [{ method: "card", tenderedMinor: 2_500 }]),
    ).toThrow(SalePaymentMismatchError);
    expect(() =>
      allocateSalePayments(2_070, [{ method: "cash", tenderedMinor: 2_000 }]),
    ).toThrow(SalePaymentMismatchError);
  });
});
