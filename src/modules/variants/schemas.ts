import { z } from "zod";

const opaqueIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);

export const variantSkuSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/);

export const variantBarcodeSchema = z.string().trim().max(64);

const optionNameSchema = z.string().trim().min(2).max(40);
const optionValueLabelSchema = z.string().trim().min(1).max(40);

function uniqueLabels(values: string[], context: z.RefinementCtx) {
  const normalized = values.map(normalizeOptionLabel);
  if (new Set(normalized).size !== normalized.length)
    context.addIssue({
      code: "custom",
      message: "Option values must be unique.",
    });
}

export const optionValueLabelsSchema = z
  .array(optionValueLabelSchema)
  .min(2)
  .max(20)
  .superRefine(uniqueLabels);

const appendedOptionValuesSchema = z
  .array(optionValueLabelSchema)
  .max(20)
  .superRefine(uniqueLabels);

export const createOptionGroupSchema = z
  .object({
    productId: opaqueIdSchema,
    expectedProductVersion: z.number().int().min(1),
    name: optionNameSchema,
    values: optionValueLabelsSchema,
  })
  .strict();

export const updateOptionGroupSchema = z
  .object({
    productId: opaqueIdSchema,
    optionGroupId: opaqueIdSchema,
    expectedProductVersion: z.number().int().min(1),
    name: optionNameSchema,
    newValues: appendedOptionValuesSchema.default([]),
  })
  .strict();

export const archiveOptionGroupSchema = z
  .object({
    productId: opaqueIdSchema,
    optionGroupId: opaqueIdSchema,
    expectedProductVersion: z.number().int().min(1),
  })
  .strict();

export const optionSelectionSchema = z
  .object({
    optionId: opaqueIdSchema,
    valueId: opaqueIdSchema,
  })
  .strict();

export const createVariantSchema = z
  .object({
    productId: opaqueIdSchema,
    expectedProductVersion: z.number().int().min(1),
    sku: variantSkuSchema,
    barcode: variantBarcodeSchema.optional(),
    priceMinor: z.number().int().min(0).max(1_000_000_000),
    costMinor: z.number().int().min(0).max(1_000_000_000).optional(),
    optionValues: z.array(optionSelectionSchema).min(1).max(3),
  })
  .strict();

export const updateVariantSchema = z
  .object({
    productId: opaqueIdSchema,
    variantId: opaqueIdSchema,
    expectedVariantVersion: z.number().int().min(1),
    sku: variantSkuSchema,
    barcode: variantBarcodeSchema.optional(),
    priceMinor: z.number().int().min(0).max(1_000_000_000),
    costMinor: z.number().int().min(0).max(1_000_000_000).optional(),
  })
  .strict();

export const archiveVariantSchema = z
  .object({
    productId: opaqueIdSchema,
    variantId: opaqueIdSchema,
    expectedVariantVersion: z.number().int().min(1),
  })
  .strict();

export type CreateOptionGroupInput = z.infer<typeof createOptionGroupSchema>;
export type UpdateOptionGroupInput = z.input<typeof updateOptionGroupSchema>;
export type ArchiveOptionGroupInput = z.infer<typeof archiveOptionGroupSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type ArchiveVariantInput = z.infer<typeof archiveVariantSchema>;

export interface ProductOptionValue {
  id: string;
  label: string;
}

export interface ProductOptionGroup {
  id: string;
  name: string;
  status: "active" | "archived";
  values: ProductOptionValue[];
  activeVariantCount: number;
}

export interface ProductVariantOptionValue {
  optionId: string;
  optionName: string;
  valueId: string;
  valueLabel: string;
}

export interface ProductVariantItem {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  priceMinor: number;
  costMinor: number | null;
  currency: string;
  status: "active" | "archived";
  isDefault: boolean;
  optionValues: ProductVariantOptionValue[];
  authorizedStock: number;
  version: number;
}

export function normalizeOptionLabel(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeVariantSku(value: string): string {
  return value.trim().toUpperCase();
}

export function createOptionSignature(
  values: Array<{ optionId: string; valueId: string }>,
): string {
  return [...values]
    .sort((left, right) => left.optionId.localeCompare(right.optionId))
    .map((value) => `${value.optionId}:${value.valueId}`)
    .join("|");
}
