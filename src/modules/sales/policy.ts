import type {
  SaleDraftLine,
  SalePaymentInput,
  SalePaymentMethod,
} from "./schemas";

export interface ResolvedSaleLine extends SaleDraftLine {
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  unitPriceMinor: number;
  unitCostMinor: number | null;
  taxRateBps: number;
  inventoryTracking: boolean;
}

export interface CalculatedSaleLine extends ResolvedSaleLine {
  lineId: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  lineTotalMinor: number;
  grossProfitMinor: number | null;
}

export interface CalculatedSale {
  lines: CalculatedSaleLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  netTotalMinor: number;
  totalMinor: number;
  grossProfitMinor: number | null;
}

export interface AllocatedPayment extends SalePaymentInput {
  method: SalePaymentMethod;
  appliedMinor: number;
}

export class SaleCalculationError extends Error {
  constructor(message = "The sale total is outside the supported range.") {
    super(message);
    this.name = "SaleCalculationError";
  }
}

export class SalePaymentMismatchError extends Error {
  constructor(
    message = "Recorded payments must cover the sale total exactly.",
  ) {
    super(message);
    this.name = "SalePaymentMismatchError";
  }
}

function safeMinor(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new SaleCalculationError();
  return value;
}

function safeSignedMinor(value: number): number {
  if (!Number.isSafeInteger(value)) throw new SaleCalculationError();
  return value;
}

export function calculateSale(
  lines: readonly ResolvedSaleLine[],
): CalculatedSale {
  if (lines.length === 0)
    throw new SaleCalculationError("Add at least one item.");
  const calculatedLines = lines.map((line, index) => {
    const subtotalMinor = safeMinor(line.unitPriceMinor * line.quantity);
    const discountMinor = safeMinor(
      Math.round((subtotalMinor * line.discountBps) / 10_000),
    );
    const taxableMinor = safeMinor(subtotalMinor - discountMinor);
    const taxMinor = safeMinor(
      Math.round((taxableMinor * line.taxRateBps) / 10_000),
    );
    const lineTotalMinor = safeMinor(taxableMinor + taxMinor);
    const grossProfitMinor =
      line.unitCostMinor === null
        ? null
        : safeSignedMinor(taxableMinor - line.unitCostMinor * line.quantity);
    return {
      ...line,
      lineId: `line_${index + 1}`,
      subtotalMinor,
      discountMinor,
      taxMinor,
      lineTotalMinor,
      grossProfitMinor,
    };
  });
  const subtotalMinor = safeMinor(
    calculatedLines.reduce((sum, line) => sum + line.subtotalMinor, 0),
  );
  const discountMinor = safeMinor(
    calculatedLines.reduce((sum, line) => sum + line.discountMinor, 0),
  );
  const taxMinor = safeMinor(
    calculatedLines.reduce((sum, line) => sum + line.taxMinor, 0),
  );
  const netTotalMinor = safeMinor(subtotalMinor - discountMinor);
  const totalMinor = safeMinor(
    calculatedLines.reduce((sum, line) => sum + line.lineTotalMinor, 0),
  );
  return {
    lines: calculatedLines,
    subtotalMinor,
    discountMinor,
    taxMinor,
    netTotalMinor,
    totalMinor,
    grossProfitMinor: calculatedLines.every(
      (line) => line.grossProfitMinor !== null,
    )
      ? calculatedLines.reduce(
          (sum, line) => safeSignedMinor(sum + (line.grossProfitMinor ?? 0)),
          0,
        )
      : null,
  };
}

export function allocateSalePayments(
  totalMinor: number,
  payments: readonly SalePaymentInput[],
): {
  payments: AllocatedPayment[];
  tenderedMinor: number;
  changeMinor: number;
} {
  const tenderedMinor = safeMinor(
    payments.reduce((sum, payment) => sum + payment.tenderedMinor, 0),
  );
  if (tenderedMinor < totalMinor)
    throw new SalePaymentMismatchError(
      "Recorded payments do not cover the total.",
    );
  if (tenderedMinor > totalMinor && payments.at(-1)?.method !== "cash")
    throw new SalePaymentMismatchError(
      "Only the final cash payment can include change.",
    );
  let remaining = totalMinor;
  const allocated = payments.map((payment) => {
    const appliedMinor = Math.min(payment.tenderedMinor, remaining);
    remaining -= appliedMinor;
    return { ...payment, appliedMinor };
  });
  return {
    payments: allocated,
    tenderedMinor,
    changeMinor: tenderedMinor - totalMinor,
  };
}
