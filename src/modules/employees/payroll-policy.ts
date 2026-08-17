import type { PayrollStatus } from "./schemas";

export interface PayrollCalculationInput {
  compensationType: "monthly" | "weekly" | "daily" | "hourly";
  baseAmountMinor: number;
  allowanceMinor: number;
  deductionMinor: number;
  overtimeRateMinor: number;
  workedMinutes: number;
  overtimeMinutes: number;
  payableDays: number;
}

export interface PayrollCalculation {
  baseMinor: number;
  allowanceMinor: number;
  overtimeMinor: number;
  deductionMinor: number;
  grossMinor: number;
  netMinor: number;
}

function roundedMinutes(rateMinor: number, minutes: number): number {
  return Math.round((rateMinor * minutes) / 60);
}

export function calculatePayrollItem(
  input: PayrollCalculationInput,
): PayrollCalculation {
  const baseMinor =
    input.compensationType === "hourly"
      ? roundedMinutes(input.baseAmountMinor, input.workedMinutes)
      : input.compensationType === "daily"
        ? input.baseAmountMinor * input.payableDays
        : input.baseAmountMinor;
  const overtimeMinor = roundedMinutes(
    input.overtimeRateMinor,
    input.overtimeMinutes,
  );
  const grossMinor = baseMinor + input.allowanceMinor + overtimeMinor;
  const deductionMinor = Math.min(input.deductionMinor, grossMinor);
  return {
    baseMinor,
    allowanceMinor: input.allowanceMinor,
    overtimeMinor,
    deductionMinor,
    grossMinor,
    netMinor: grossMinor - deductionMinor,
  };
}

const transitions: Record<PayrollStatus, readonly PayrollStatus[]> = {
  draft: ["review"],
  review: ["approved"],
  approved: ["finalized"],
  finalized: ["reversed"],
  reversed: [],
};

export function canTransitionPayroll(
  current: PayrollStatus,
  target: PayrollStatus,
): boolean {
  return transitions[current].includes(target);
}

export function requirePayrollTransition(
  current: PayrollStatus,
  target: PayrollStatus,
): void {
  if (!canTransitionPayroll(current, target)) {
    throw new Error(`Payroll cannot move from ${current} to ${target}.`);
  }
}
