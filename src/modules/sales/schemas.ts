import { z } from "zod";

const opaqueIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9:_-]+$/);

export const salePaymentMethodSchema = z.enum([
  "cash",
  "card",
  "bank_transfer",
  "mobile_wallet",
  "credit",
  "other",
]);

export const saleDraftLineSchema = z
  .object({
    variantId: opaqueIdSchema,
    quantity: z.number().int().min(1).max(1_000_000),
    discountBps: z.number().int().min(0).max(10_000),
    expectedLevelVersion: z.number().int().min(0),
  })
  .strict();

export const salePaymentInputSchema = z
  .object({
    method: salePaymentMethodSchema,
    tenderedMinor: z.number().int().min(0).max(1_000_000_000_000),
  })
  .strict();

export const completeSaleSchema = z
  .object({
    storeId: opaqueIdSchema,
    customerId: z.union([opaqueIdSchema, z.literal("")]),
    lines: z.array(saleDraftLineSchema).min(1).max(50),
    payments: z.array(salePaymentInputSchema).min(1).max(6),
    note: z.string().trim().max(500),
    idempotencyKey: opaqueIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const variants = new Set<string>();
    for (const [index, line] of value.lines.entries()) {
      if (variants.has(line.variantId))
        context.addIssue({
          code: "custom",
          path: ["lines", index, "variantId"],
          message: "Each SKU can appear only once in a sale.",
        });
      variants.add(line.variantId);
    }
    const methods = new Set<string>();
    for (const [index, payment] of value.payments.entries()) {
      if (methods.has(payment.method))
        context.addIssue({
          code: "custom",
          path: ["payments", index, "method"],
          message: "Combine payments that use the same method.",
        });
      methods.add(payment.method);
    }
  });

export const saleCatalogQuerySchema = z.object({
  q: z.string().trim().max(120).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(6).max(30).catch(12),
});

export const saleScanQuerySchema = z
  .object({
    code: z.string().trim().min(1).max(160),
  })
  .strict();

export const receiptIdSchema = opaqueIdSchema;

export const voidSaleSchema = z
  .object({
    saleId: opaqueIdSchema,
    confirmationReceiptNumber: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export type SalePaymentMethod = z.infer<typeof salePaymentMethodSchema>;
export type SaleDraftLine = z.infer<typeof saleDraftLineSchema>;
export type SalePaymentInput = z.infer<typeof salePaymentInputSchema>;
export type CompleteSaleInput = z.infer<typeof completeSaleSchema>;
export type VoidSaleInput = z.infer<typeof voidSaleSchema>;
export type SaleCatalogQuery = z.infer<typeof saleCatalogQuerySchema>;
export type SaleScanQuery = z.infer<typeof saleScanQuerySchema>;

export interface SaleCatalogItem {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  category: string;
  priceMinor: number;
  taxRateBps: number;
  currency: string;
  inventoryTracking: boolean;
  quantity: number | null;
  levelVersion: number;
}

export interface SaleCustomerOption {
  id: string;
  code: string;
  name: string;
  company: string;
}

export interface SaleWorkspace {
  store: { id: string; code: string; name: string } | null;
  currency: string;
  locale: string;
  catalog: {
    items: SaleCatalogItem[];
    total: number;
    page: number;
    pageSize: number;
  };
  customers: SaleCustomerOption[];
}

export interface SaleReceiptLine {
  lineId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPriceMinor: number;
  subtotalMinor: number;
  discountBps: number;
  discountMinor: number;
  taxRateBps: number;
  taxMinor: number;
  lineTotalMinor: number;
}

export interface SaleReceiptPayment {
  id: string;
  method: SalePaymentMethod;
  tenderedMinor: number;
  appliedMinor: number;
}

export interface SaleReceipt {
  id: string;
  receiptNumber: string;
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  status: "completed" | "voided";
  store: { id: string; code: string; name: string; address: string };
  customer: { id: string; code: string; name: string } | null;
  currency: string;
  locale: string;
  timezone: string;
  lines: SaleReceiptLine[];
  payments: SaleReceiptPayment[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  netTotalMinor: number;
  totalMinor: number;
  tenderedMinor: number;
  changeMinor: number;
  note: string;
  completedAt: string;
  voidedAt: string | null;
  voidReason: string;
}

export const salePaymentLabels: Record<SalePaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  mobile_wallet: "Mobile wallet",
  credit: "Credit",
  other: "Other",
};
