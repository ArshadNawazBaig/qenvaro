import { z } from "zod";

const opaqueIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9:_-]+$/);

export const inventoryMovementTypeSchema = z.enum([
  "opening_balance",
  "purchase_receipt",
  "sale",
  "sale_return",
  "sale_void",
  "manual_adjustment",
  "transfer_out",
  "transfer_in",
  "damaged",
  "expired",
  "correction",
]);

export const stockAdjustmentReasonSchema = z.enum([
  "cycle_count",
  "damaged",
  "expired",
  "other_receipt",
  "correction",
]);

export const stockAdjustmentModeSchema = z.enum([
  "increase",
  "decrease",
  "set",
]);

export const createStockAdjustmentSchema = z
  .object({
    storeId: opaqueIdSchema,
    variantId: opaqueIdSchema,
    mode: stockAdjustmentModeSchema,
    quantity: z.number().int().min(0).max(1_000_000),
    reason: stockAdjustmentReasonSchema,
    note: z.string().trim().min(3).max(500),
    expectedLevelVersion: z.number().int().min(0),
    idempotencyKey: opaqueIdSchema,
  })
  .superRefine((value, context) => {
    if (value.mode !== "set" && value.quantity === 0)
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "Enter a quantity greater than zero.",
      });
    if (
      (value.reason === "damaged" || value.reason === "expired") &&
      value.mode !== "decrease"
    )
      context.addIssue({
        code: "custom",
        path: ["mode"],
        message: "Damaged and expired stock must reduce inventory.",
      });
    if (value.reason === "other_receipt" && value.mode !== "increase")
      context.addIssue({
        code: "custom",
        path: ["mode"],
        message: "Other receipts must increase inventory.",
      });
  });

export const stockTransferLineSchema = z
  .object({
    variantId: opaqueIdSchema,
    quantity: z.number().int().min(1).max(1_000_000),
    expectedSourceVersion: z.number().int().min(0),
    expectedDestinationVersion: z.number().int().min(0),
  })
  .strict();

export const createStockTransferSchema = z
  .object({
    fromStoreId: opaqueIdSchema,
    toStoreId: opaqueIdSchema,
    lines: z.array(stockTransferLineSchema).min(1).max(20),
    note: z.string().trim().min(3).max(500),
    idempotencyKey: opaqueIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.fromStoreId === value.toStoreId)
      context.addIssue({
        code: "custom",
        path: ["toStoreId"],
        message: "Choose two different stores.",
      });
    const seen = new Set<string>();
    for (const [index, line] of value.lines.entries()) {
      if (seen.has(line.variantId))
        context.addIssue({
          code: "custom",
          path: ["lines", index, "variantId"],
          message: "Each SKU can appear only once in a transfer.",
        });
      seen.add(line.variantId);
    }
  });

export const productAvailabilityQuerySchema = z.object({
  q: z.string().trim().max(120).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(5).max(50).catch(10),
});

export const updateProductAvailabilitySchema = z
  .object({
    productId: opaqueIdSchema,
    expectedVersion: z.number().int().min(1),
    availableStoreIds: z.array(opaqueIdSchema).min(1).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.availableStoreIds).size !== value.availableStoreIds.length
    )
      context.addIssue({
        code: "custom",
        path: ["availableStoreIds"],
        message: "Choose each store only once.",
      });
  });

export const updateLowStockAlertPreferencesSchema = z
  .object({
    enabled: z.boolean(),
    includeLowStock: z.boolean(),
    includeOutOfStock: z.boolean(),
    expectedVersion: z.number().int().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.enabled && !value.includeLowStock && !value.includeOutOfStock)
      context.addIssue({
        code: "custom",
        path: ["includeLowStock"],
        message: "Choose at least one alert severity.",
      });
  });

export type CreateStockAdjustmentInput = z.infer<
  typeof createStockAdjustmentSchema
>;
export type CreateStockTransferInput = z.infer<
  typeof createStockTransferSchema
>;
export type ProductAvailabilityQuery = z.infer<
  typeof productAvailabilityQuerySchema
>;
export type UpdateProductAvailabilityInput = z.infer<
  typeof updateProductAvailabilitySchema
>;
export type UpdateLowStockAlertPreferencesInput = z.infer<
  typeof updateLowStockAlertPreferencesSchema
>;
export type InventoryMovementType = z.infer<typeof inventoryMovementTypeSchema>;
export type StockAdjustmentReason = z.infer<typeof stockAdjustmentReasonSchema>;

export interface InventoryLevelSnapshot {
  storeId: string;
  quantity: number;
  version: number;
}

export interface InventoryVariantOption {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  productStatus: "draft" | "active" | "archived";
  variantStatus: "active" | "archived";
  availableStoreIds: string[];
  levels: InventoryLevelSnapshot[];
}

export interface InventoryOverviewRow extends InventoryVariantOption {
  quantity: number;
  levelVersion: number;
  reorderLevel: number;
}

export interface InventoryOverview {
  store: { id: string; code: string; name: string } | null;
  rows: InventoryOverviewRow[];
  metrics: {
    trackedSkus: number;
    unitsOnHand: number;
    lowStock: number;
    outOfStock: number;
  };
  movements: InventoryMovementItem[];
}

export interface InventoryMovementItem {
  id: string;
  type: InventoryMovementType;
  productName: string;
  variantName: string;
  sku: string;
  quantityDelta: number;
  resultingQuantity: number;
  note: string;
  occurredAt: string;
}

export interface StockAdjustmentItem {
  id: string;
  storeId: string;
  storeName: string;
  productName: string;
  variantName: string;
  sku: string;
  reason: StockAdjustmentReason;
  quantityDelta: number;
  previousQuantity: number;
  newQuantity: number;
  note: string;
  createdAt: string;
}

export interface StockTransferItem {
  id: string;
  transferNumber: string;
  fromStoreName: string;
  toStoreName: string;
  status: "completed";
  lineCount: number;
  unitCount: number;
  note: string;
  createdAt: string;
}

export interface ProductAvailabilityItem {
  productId: string;
  name: string;
  sku: string;
  status: "draft" | "active" | "archived";
  version: number;
  availableStoreIds: string[];
  quantities: Array<{ storeId: string; quantity: number }>;
}

export interface ProductAvailabilityResult {
  items: ProductAvailabilityItem[];
  total: number;
}

export interface LowStockAlertPreferences {
  enabled: boolean;
  includeLowStock: boolean;
  includeOutOfStock: boolean;
  version: number;
}

export interface LowStockAlertItem {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  storeId: string;
  storeName: string;
  storeCode: string;
  quantity: number;
  reorderLevel: number;
  severity: "low" | "out";
}
