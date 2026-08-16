import { describe, expect, it } from "vitest";
import { addMoney, formatMoney } from "./money";

describe("money helpers", () => {
  it("adds integer minor units without floating-point drift", () => {
    expect(
      addMoney([
        { amountMinor: 10, currency: "USD" },
        { amountMinor: 20, currency: "USD" },
      ]),
    ).toEqual({ amountMinor: 30, currency: "USD" });
  });
  it("rejects mixed currencies", () => {
    expect(() =>
      addMoney([
        { amountMinor: 100, currency: "USD" },
        { amountMinor: 100, currency: "EUR" },
      ]),
    ).toThrow(/different currencies/);
  });
  it("formats with currency metadata", () => {
    expect(formatMoney({ amountMinor: 12345, currency: "USD" }, "en-US")).toBe(
      "$123.45",
    );
  });
});
