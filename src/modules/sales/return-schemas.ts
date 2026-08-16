import { z } from "zod";
import { salePaymentMethodSchema, type SalePaymentMethod } from "./schemas";

const opaqueIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9:_-]+$/);

export const saleReturnReasonSchema = z.enum([
  "customer_request",
  "defective",
  "wrong_item",
  "damaged",
  "other",
]);

export const saleReturnLineInputSchema = z
  .object({
    saleLineId: opaqueIdSchema,
    quantity: z.number().int().min(1).max(1_000_000),
    expectedLevelVersion: z.number().int().min(0),
  })
  .strict();

export const completeSaleReturnSchema = z
  .object({
    saleId: opaqueIdSchema,
    storeId: opaqueIdSchema,
    lines: z.array(saleReturnLineInputSchema).min(1).max(50),
    refundMethod: salePaymentMethodSchema,
    reason: saleReturnReasonSchema,
    note: z.string().trim().max(500),
    idempotencyKey: opaqueIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const lineIds = new Set<string>();
    for (const [index, line] of value.lines.entries()) {
      if (lineIds.has(line.saleLineId))
        context.addIssue({
          code: "custom",
          path: ["lines", index, "saleLineId"],
          message: "Each sale line can appear only once in a return.",
        });
      lineIds.add(line.saleLineId);
    }
    if (value.reason === "other" && value.note.length < 3)
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "Describe the reason when Other is selected.",
      });
  });

export const salesHistoryQuerySchema = z.object({
  q: z.string().trim().max(120).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(5).max(50).catch(10),
});

export const returnIdSchema = opaqueIdSchema;

export type SaleReturnReason = z.infer<typeof saleReturnReasonSchema>;
export type SaleReturnLineInput = z.infer<typeof saleReturnLineInputSchema>;
export type CompleteSaleReturnInput = z.infer<typeof completeSaleReturnSchema>;
export type SalesHistoryQuery = z.infer<typeof salesHistoryQuerySchema>;

export interface SaleHistoryItem {
  id: string;
  receiptNumber: string;
  storeName: string;
  customerName: string;
  lineCount: number;
  unitCount: number;
  currency: string;
  totalMinor: number;
  returnedTotalMinor: number;
  completedAt: string;
}

export interface SalesHistoryResult {
  items: SaleHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  currency: string;
  locale: string;
  timezone: string;
}

export interface SaleReturnWorkspaceLine {
  lineId: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  originalQuantity: number;
  returnedQuantity: number;
  remainingQuantity: number;
  unitPriceMinor: number;
  unitCostMinor: number | null;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  lineTotalMinor: number;
  returnedSubtotalMinor: number;
  returnedDiscountMinor: number;
  returnedTaxMinor: number;
  returnedLineTotalMinor: number;
  inventoryTracking: boolean;
  levelVersion: number;
}

export interface SaleReturnHistoryItem {
  id: string;
  returnNumber: string;
  reason: SaleReturnReason;
  refundMethod: SalePaymentMethod;
  totalMinor: number;
  unitCount: number;
  completedAt: string;
}

export interface SaleReturnWorkspace {
  sale: {
    id: string;
    receiptNumber: string;
    completedAt: string;
    customerName: string;
    totalMinor: number;
  };
  store: { id: string; code: string; name: string };
  currency: string;
  locale: string;
  timezone: string;
  lines: SaleReturnWorkspaceLine[];
  previousReturns: SaleReturnHistoryItem[];
  returnedTotalMinor: number;
  remainingTotalMinor: number;
}

export interface SaleReturnReceiptLine {
  lineId: string;
  saleLineId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  lineTotalMinor: number;
}

export interface SaleReturnReceipt {
  id: string;
  returnNumber: string;
  originalSaleId: string;
  originalReceiptNumber: string;
  businessName: string;
  store: { id: string; code: string; name: string };
  customerName: string;
  status: "completed";
  reason: SaleReturnReason;
  note: string;
  currency: string;
  locale: string;
  timezone: string;
  lines: SaleReturnReceiptLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  refund: {
    id: string;
    method: SalePaymentMethod;
    amountMinor: number;
    status: "recorded";
  };
  completedAt: string;
}

export const saleReturnReasonLabels: Record<SaleReturnReason, string> = {
  customer_request: "Customer request",
  defective: "Defective item",
  wrong_item: "Wrong item",
  damaged: "Damaged item",
  other: "Other",
};
