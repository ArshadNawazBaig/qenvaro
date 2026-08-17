import { describe, expect, it } from "vitest";
import { calculatePurchaseLine, canTransitionPurchase } from "./policy";

describe("purchasing policy", () => {
  it("calculates line tax in integer minor units", () => {
    expect(
      calculatePurchaseLine({
        quantity: 3,
        unitCostMinor: 1_999,
        taxRateBps: 1_750,
      }),
    ).toEqual({ subtotalMinor: 5_997, taxMinor: 1_049, totalMinor: 7_046 });
  });

  it("enforces purchase state transitions", () => {
    expect(canTransitionPurchase("draft", "submitted")).toBe(true);
    expect(canTransitionPurchase("submitted", "received")).toBe(false);
    expect(canTransitionPurchase("partially_received", "cancelled")).toBe(
      false,
    );
  });
});
