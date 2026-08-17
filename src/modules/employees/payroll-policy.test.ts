import { describe, expect, it } from "vitest";
import {
  calculatePayrollItem,
  canTransitionPayroll,
  requirePayrollTransition,
} from "./payroll-policy";

describe("operational payroll policy", () => {
  it("calculates salaried pay using integer minor units", () => {
    expect(
      calculatePayrollItem({
        compensationType: "monthly",
        baseAmountMinor: 200_000,
        allowanceMinor: 25_000,
        deductionMinor: 10_000,
        overtimeRateMinor: 1_500,
        workedMinutes: 0,
        overtimeMinutes: 120,
        payableDays: 22,
      }),
    ).toEqual({
      baseMinor: 200_000,
      allowanceMinor: 25_000,
      overtimeMinor: 3_000,
      deductionMinor: 10_000,
      grossMinor: 228_000,
      netMinor: 218_000,
    });
  });

  it("calculates hourly and daily pay without floating-point storage", () => {
    expect(
      calculatePayrollItem({
        compensationType: "hourly",
        baseAmountMinor: 2_000,
        allowanceMinor: 0,
        deductionMinor: 0,
        overtimeRateMinor: 3_000,
        workedMinutes: 450,
        overtimeMinutes: 30,
        payableDays: 1,
      }).netMinor,
    ).toBe(16_500);
    expect(
      calculatePayrollItem({
        compensationType: "daily",
        baseAmountMinor: 10_000,
        allowanceMinor: 0,
        deductionMinor: 120_000,
        overtimeRateMinor: 0,
        workedMinutes: 0,
        overtimeMinutes: 0,
        payableDays: 10,
      }).netMinor,
    ).toBe(0);
  });

  it("permits only the explicit payroll lifecycle", () => {
    expect(canTransitionPayroll("draft", "review")).toBe(true);
    expect(canTransitionPayroll("review", "finalized")).toBe(false);
    expect(canTransitionPayroll("finalized", "reversed")).toBe(true);
    expect(() => requirePayrollTransition("approved", "review")).toThrow(
      /cannot move/,
    );
  });
});
