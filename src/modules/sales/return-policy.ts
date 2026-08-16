import type {
  SaleReturnLineInput,
  SaleReturnWorkspaceLine,
} from "./return-schemas";

export interface ReturnableSaleLineSnapshot {
  lineId: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPriceMinor: number;
  unitCostMinor: number | null;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  lineTotalMinor: number;
  inventoryTracking: boolean;
}

export interface PreviousSaleReturnAllocation {
  saleLineId: string;
  quantity: number;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  lineTotalMinor: number;
}

export interface CalculatedSaleReturnLine {
  lineId: string;
  saleLineId: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  netTotalMinor: number;
  lineTotalMinor: number;
  grossProfitReversalMinor: number | null;
  inventoryTracking: boolean;
  expectedLevelVersion: number;
}

export interface CalculatedSaleReturn {
  lines: CalculatedSaleReturnLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  netTotalMinor: number;
  totalMinor: number;
  grossProfitReversalMinor: number | null;
}

export class SaleReturnCalculationError extends Error {
  constructor(message = "The return total is outside the supported range.") {
    super(message);
    this.name = "SaleReturnCalculationError";
  }
}

export class SaleReturnQuantityError extends Error {
  constructor(message = "A return quantity exceeds the remaining sale units.") {
    super(message);
    this.name = "SaleReturnQuantityError";
  }
}

function safeMinor(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new SaleReturnCalculationError();
  return value;
}

function safeSignedMinor(value: number): number {
  if (!Number.isSafeInteger(value)) throw new SaleReturnCalculationError();
  return value;
}

function cumulativeAllocation(
  totalMinor: number,
  cumulativeQuantity: number,
  originalQuantity: number,
): number {
  if (
    !Number.isSafeInteger(totalMinor) ||
    totalMinor < 0 ||
    !Number.isSafeInteger(cumulativeQuantity) ||
    cumulativeQuantity < 0 ||
    !Number.isSafeInteger(originalQuantity) ||
    originalQuantity < 1 ||
    cumulativeQuantity > originalQuantity
  )
    throw new SaleReturnCalculationError();
  const numerator = BigInt(totalMinor) * BigInt(cumulativeQuantity);
  const denominator = BigInt(originalQuantity);
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const rounded = quotient + (remainder * 2n >= denominator ? 1n : 0n);
  const result = Number(rounded);
  return safeMinor(result);
}

function currentAllocation(
  totalMinor: number,
  previousMinor: number,
  returnedQuantity: number,
  requestedQuantity: number,
  originalQuantity: number,
): number {
  const cumulative = cumulativeAllocation(
    totalMinor,
    returnedQuantity + requestedQuantity,
    originalQuantity,
  );
  return safeMinor(cumulative - previousMinor);
}

export function projectReturnableSaleLines(
  originalLines: readonly ReturnableSaleLineSnapshot[],
  previousLines: readonly PreviousSaleReturnAllocation[],
  levelVersions: ReadonlyMap<string, number>,
): SaleReturnWorkspaceLine[] {
  const returnedByLine = new Map<
    string,
    {
      quantity: number;
      subtotalMinor: number;
      discountMinor: number;
      taxMinor: number;
      lineTotalMinor: number;
    }
  >();
  for (const line of previousLines) {
    const current = returnedByLine.get(line.saleLineId) ?? {
      quantity: 0,
      subtotalMinor: 0,
      discountMinor: 0,
      taxMinor: 0,
      lineTotalMinor: 0,
    };
    returnedByLine.set(line.saleLineId, {
      quantity: safeMinor(current.quantity + line.quantity),
      subtotalMinor: safeMinor(current.subtotalMinor + line.subtotalMinor),
      discountMinor: safeMinor(current.discountMinor + line.discountMinor),
      taxMinor: safeMinor(current.taxMinor + line.taxMinor),
      lineTotalMinor: safeMinor(current.lineTotalMinor + line.lineTotalMinor),
    });
  }
  return originalLines.map((line) => {
    const returned = returnedByLine.get(line.lineId) ?? {
      quantity: 0,
      subtotalMinor: 0,
      discountMinor: 0,
      taxMinor: 0,
      lineTotalMinor: 0,
    };
    if (returned.quantity > line.quantity)
      throw new SaleReturnCalculationError(
        "Recorded returns exceed the original sale quantity.",
      );
    return {
      lineId: line.lineId,
      productId: line.productId,
      variantId: line.variantId,
      productName: line.productName,
      variantName: line.variantName,
      sku: line.sku,
      originalQuantity: line.quantity,
      returnedQuantity: returned.quantity,
      remainingQuantity: line.quantity - returned.quantity,
      unitPriceMinor: line.unitPriceMinor,
      unitCostMinor: line.unitCostMinor,
      subtotalMinor: line.subtotalMinor,
      discountMinor: line.discountMinor,
      taxMinor: line.taxMinor,
      lineTotalMinor: line.lineTotalMinor,
      returnedSubtotalMinor: returned.subtotalMinor,
      returnedDiscountMinor: returned.discountMinor,
      returnedTaxMinor: returned.taxMinor,
      returnedLineTotalMinor: returned.lineTotalMinor,
      inventoryTracking: line.inventoryTracking,
      levelVersion: line.inventoryTracking
        ? (levelVersions.get(line.variantId) ?? 0)
        : 0,
    };
  });
}

export function calculateSaleReturn(
  availableLines: readonly SaleReturnWorkspaceLine[],
  requestedLines: readonly SaleReturnLineInput[],
): CalculatedSaleReturn {
  if (requestedLines.length === 0)
    throw new SaleReturnCalculationError("Choose at least one item to return.");
  const availableById = new Map(
    availableLines.map((line) => [line.lineId, line]),
  );
  const lines = requestedLines.map((request, index) => {
    const original = availableById.get(request.saleLineId);
    if (!original)
      throw new SaleReturnQuantityError("A selected sale line was not found.");
    if (request.quantity > original.remainingQuantity)
      throw new SaleReturnQuantityError();
    const subtotalMinor = currentAllocation(
      original.subtotalMinor,
      original.returnedSubtotalMinor,
      original.returnedQuantity,
      request.quantity,
      original.originalQuantity,
    );
    const discountMinor = currentAllocation(
      original.discountMinor,
      original.returnedDiscountMinor,
      original.returnedQuantity,
      request.quantity,
      original.originalQuantity,
    );
    const taxMinor = currentAllocation(
      original.taxMinor,
      original.returnedTaxMinor,
      original.returnedQuantity,
      request.quantity,
      original.originalQuantity,
    );
    const netTotalMinor = safeMinor(subtotalMinor - discountMinor);
    const lineTotalMinor = safeMinor(netTotalMinor + taxMinor);
    return {
      lineId: `return_line_${index + 1}`,
      saleLineId: original.lineId,
      productId: original.productId,
      variantId: original.variantId,
      productName: original.productName,
      variantName: original.variantName,
      sku: original.sku,
      quantity: request.quantity,
      subtotalMinor,
      discountMinor,
      taxMinor,
      netTotalMinor,
      lineTotalMinor,
      grossProfitReversalMinor:
        original.unitCostMinor === null
          ? null
          : safeSignedMinor(
              netTotalMinor - original.unitCostMinor * request.quantity,
            ),
      inventoryTracking: original.inventoryTracking,
      expectedLevelVersion: request.expectedLevelVersion,
    };
  });
  const subtotalMinor = safeMinor(
    lines.reduce((sum, line) => sum + line.subtotalMinor, 0),
  );
  const discountMinor = safeMinor(
    lines.reduce((sum, line) => sum + line.discountMinor, 0),
  );
  const taxMinor = safeMinor(
    lines.reduce((sum, line) => sum + line.taxMinor, 0),
  );
  const netTotalMinor = safeMinor(
    lines.reduce((sum, line) => sum + line.netTotalMinor, 0),
  );
  const totalMinor = safeMinor(
    lines.reduce((sum, line) => sum + line.lineTotalMinor, 0),
  );
  return {
    lines,
    subtotalMinor,
    discountMinor,
    taxMinor,
    netTotalMinor,
    totalMinor,
    grossProfitReversalMinor: lines.every(
      (line) => line.grossProfitReversalMinor !== null,
    )
      ? lines.reduce(
          (sum, line) =>
            safeSignedMinor(sum + (line.grossProfitReversalMinor ?? 0)),
          0,
        )
      : null,
  };
}
