import { z } from "zod";

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine(
    (value) => value === "" || z.string().email().safeParse(value).success,
    "Enter a valid email address.",
  )
  .transform((value) => value.toLowerCase());

export const supplierFieldsSchema = z
  .object({
    name: z.string().trim().min(2).max(140),
    contactName: z.string().trim().max(120),
    email: optionalEmail,
    phone: z.string().trim().max(32),
    address: z.string().trim().max(500),
    taxNumber: z.string().trim().max(80),
    paymentTerms: z.string().trim().max(120),
    notes: z.string().trim().max(1_000),
  })
  .strict();
export const createSupplierSchema = supplierFieldsSchema;
export const updateSupplierSchema = supplierFieldsSchema.extend({
  supplierId: idSchema,
  expectedVersion: z.number().int().min(1),
});
export const archiveSupplierSchema = z
  .object({
    supplierId: idSchema,
    expectedVersion: z.number().int().min(1),
  })
  .strict();
export const supplierListQuerySchema = z.object({
  q: z.string().trim().max(120).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(5).max(50).catch(10),
  status: z.enum(["all", "active", "archived"]).catch("all"),
});

export const purchaseStatusSchema = z.enum([
  "draft",
  "submitted",
  "approved",
  "partially_received",
  "received",
  "cancelled",
]);
export const purchaseLineInputSchema = z
  .object({
    variantId: idSchema,
    quantity: z.number().int().min(1).max(1_000_000),
    unitCostMinor: z.number().int().min(0).max(100_000_000_000),
    taxRateBps: z.number().int().min(0).max(100_000),
  })
  .strict();
export const createPurchaseOrderSchema = z
  .object({
    supplierId: idSchema,
    storeId: idSchema,
    expectedDeliveryDate: dateSchema.or(z.literal("")),
    note: z.string().trim().max(1_000),
    lines: z.array(purchaseLineInputSchema).min(1).max(50),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const transitionPurchaseOrderSchema = z
  .object({
    purchaseOrderId: idSchema,
    expectedVersion: z.number().int().min(1),
    targetStatus: z.enum(["submitted", "approved", "cancelled"]),
    reason: z.string().trim().max(500),
  })
  .strict();
export const receivePurchaseOrderSchema = z
  .object({
    purchaseOrderId: idSchema,
    expectedVersion: z.number().int().min(1),
    receivedAt: z.string().datetime({ offset: true }),
    note: z.string().trim().max(500),
    lines: z
      .array(
        z
          .object({
            lineId: idSchema,
            quantity: z.number().int().min(0).max(1_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .refine((input) => input.lines.some((line) => line.quantity > 0), {
    path: ["lines"],
    message: "Receive at least one item.",
  });

export const expenseStatusSchema = z.enum([
  "submitted",
  "approved",
  "rejected",
  "voided",
]);
export const createExpenseSchema = z
  .object({
    storeId: idSchema,
    category: z.string().trim().min(2).max(80),
    vendor: z.string().trim().min(2).max(140),
    expenseDate: dateSchema,
    amountMinor: z.number().int().min(1).max(100_000_000_000),
    notes: z.string().trim().max(1_000),
    receiptUrl: z.string().url().max(2_000).or(z.literal("")),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const decideExpenseSchema = z
  .object({
    expenseId: idSchema,
    expectedVersion: z.number().int().min(1),
    decision: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(500),
  })
  .strict();
export const expenseListQuerySchema = z.object({
  q: z.string().trim().max(120).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(5).max(50).catch(10),
  status: z
    .enum(["all", "submitted", "approved", "rejected", "voided"])
    .catch("all"),
  store: z.string().trim().max(120).catch("all"),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ArchiveSupplierInput = z.infer<typeof archiveSupplierSchema>;
export type SupplierListQuery = z.infer<typeof supplierListQuerySchema>;
export type PurchaseStatus = z.infer<typeof purchaseStatusSchema>;
export type CreatePurchaseOrderInput = z.infer<
  typeof createPurchaseOrderSchema
>;
export type TransitionPurchaseOrderInput = z.infer<
  typeof transitionPurchaseOrderSchema
>;
export type ReceivePurchaseOrderInput = z.infer<
  typeof receivePurchaseOrderSchema
>;
export type ExpenseStatus = z.infer<typeof expenseStatusSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type DecideExpenseInput = z.infer<typeof decideExpenseSchema>;
export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;

export interface SupplierListItem extends CreateSupplierInput {
  id: string;
  supplierCode: string;
  status: "active" | "archived";
  version: number;
  createdAt: string;
}

export interface PurchaseLineSnapshot {
  lineId: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCostMinor: number;
  taxRateBps: number;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface PurchaseOrderListItem {
  id: string;
  purchaseOrderNumber: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  storeId: string;
  storeName: string;
  expectedDeliveryDate: string;
  currency: string;
  status: PurchaseStatus;
  lines: PurchaseLineSnapshot[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  version: number;
  createdAt: string;
}

export interface ExpenseListItem {
  id: string;
  expenseNumber: string;
  storeId: string;
  storeName: string;
  category: string;
  vendor: string;
  expenseDate: string;
  amountMinor: number;
  currency: string;
  notes: string;
  receiptUrl: string;
  status: ExpenseStatus;
  decisionNote: string;
  version: number;
  createdAt: string;
}

export interface PurchasingReferenceData {
  currency: string;
  stores: { id: string; code: string; name: string }[];
  expenseCategories: { id: string; name: string }[];
  suppliers: { id: string; supplierCode: string; name: string }[];
  variants: {
    id: string;
    productId: string;
    productName: string;
    name: string;
    sku: string;
    costMinor: number;
  }[];
}

export function normalizeSupplierValue(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function createSupplierCode(id: string): string {
  return `S-${id.slice(-8).toUpperCase()}`;
}
