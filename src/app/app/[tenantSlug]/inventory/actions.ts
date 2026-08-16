"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BillingAccessError } from "@/modules/billing/entitlements";
import {
  InventoryIdempotencyConflictError,
  InventoryNegativeStockError,
  InventoryNotFoundError,
  InventoryProductUnavailableError,
  InventoryService,
  InventoryStoreUnavailableError,
  InventoryVersionConflictError,
  InventoryAlertSettingsVersionConflictError,
  ProductAvailabilityVersionConflictError,
  ProductStoreHasInventoryError,
} from "@/modules/inventory/service";
import {
  stockAdjustmentModeSchema,
  stockAdjustmentReasonSchema,
  stockTransferLineSchema,
} from "@/modules/inventory/schemas";
import { PermissionError } from "@/modules/permissions/permissions";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

const adjustmentFormSchema = z.object({
  storeId: z.string().trim().min(1),
  variantId: z.string().trim().min(1),
  mode: stockAdjustmentModeSchema,
  quantity: z.coerce.number().int().min(0).max(1_000_000),
  reason: stockAdjustmentReasonSchema,
  note: z.string().trim().min(3).max(500),
  expectedLevelVersion: z.coerce.number().int().min(0),
  idempotencyKey: z.string().trim().min(1).max(160),
});

const transferFormSchema = z.object({
  fromStoreId: z.string().trim().min(1),
  toStoreId: z.string().trim().min(1),
  linesJson: z.string().trim().min(2).max(20_000),
  note: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(1).max(160),
});

export interface InventoryActionState {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
  version?: number;
}

function actionErrorState(error: unknown): InventoryActionState {
  if (error instanceof z.ZodError)
    return {
      status: "error",
      message: error.issues[0]?.message ?? "Check the inventory fields.",
    };
  if (error instanceof InventoryVersionConflictError)
    return {
      status: "conflict",
      message: "Stock changed in another session. Reload before retrying.",
    };
  if (
    error instanceof ProductAvailabilityVersionConflictError ||
    error instanceof InventoryAlertSettingsVersionConflictError
  )
    return { status: "conflict", message: error.message };
  if (
    error instanceof InventoryNegativeStockError ||
    error instanceof InventoryStoreUnavailableError ||
    error instanceof InventoryProductUnavailableError ||
    error instanceof InventoryIdempotencyConflictError ||
    error instanceof ProductStoreHasInventoryError ||
    error instanceof PermissionError ||
    error instanceof BillingAccessError
  )
    return { status: "error", message: error.message };
  if (error instanceof InventoryNotFoundError)
    return { status: "error", message: "Inventory record not found." };
  return {
    status: "error",
    message: "The inventory change could not be completed. Try again.",
  };
}

const availabilityFormSchema = z.object({
  expectedVersion: z.coerce.number().int().min(1),
  availableStoreIds: z.array(z.string().trim().min(1)).min(1).max(100),
});

const alertPreferencesFormSchema = z.object({
  expectedVersion: z.coerce.number().int().min(1),
});

function revalidateInventory(tenantSlug: string): void {
  revalidatePath(`/app/${tenantSlug}`);
  revalidatePath(`/app/${tenantSlug}/products`);
  revalidatePath(`/app/${tenantSlug}/inventory`);
  revalidatePath(`/app/${tenantSlug}/inventory/adjustments`);
  revalidatePath(`/app/${tenantSlug}/inventory/transfers`);
}

export async function createStockAdjustmentAction(
  tenantSlug: string,
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  try {
    const raw = adjustmentFormSchema.parse(Object.fromEntries(formData));
    const context = await requireTenantContext(tenantSlug);
    const result = await new InventoryService().adjust(context, raw);
    revalidateInventory(context.tenantSlug);
    return {
      status: "success",
      message: result.idempotent
        ? "This adjustment was already posted."
        : `Adjustment posted. New on-hand quantity: ${result.newQuantity.toLocaleString()}.`,
    };
  } catch (error) {
    return actionErrorState(error);
  }
}

export async function createStockTransferAction(
  tenantSlug: string,
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  try {
    const raw = transferFormSchema.parse(Object.fromEntries(formData));
    const parsedJson: unknown = JSON.parse(raw.linesJson);
    const lines = z
      .array(stockTransferLineSchema)
      .min(1)
      .max(20)
      .parse(parsedJson);
    const context = await requireTenantContext(tenantSlug);
    const result = await new InventoryService().transfer(context, {
      fromStoreId: raw.fromStoreId,
      toStoreId: raw.toStoreId,
      lines,
      note: raw.note,
      idempotencyKey: raw.idempotencyKey,
    });
    revalidateInventory(context.tenantSlug);
    return {
      status: "success",
      message: result.idempotent
        ? `${result.transferNumber} was already completed.`
        : `${result.transferNumber} completed.`,
    };
  } catch (error) {
    if (error instanceof SyntaxError)
      return {
        status: "error",
        message: "Add at least one valid transfer line.",
      };
    return actionErrorState(error);
  }
}

export async function updateProductAvailabilityAction(
  tenantSlug: string,
  productId: string,
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  try {
    const raw = availabilityFormSchema.parse({
      expectedVersion: formData.get("expectedVersion"),
      availableStoreIds: formData.getAll("availableStoreIds"),
    });
    const context = await requireTenantContext(tenantSlug);
    const result = await new InventoryService().updateProductAvailability(
      context,
      { productId, ...raw },
    );
    revalidateInventory(context.tenantSlug);
    revalidatePath(`/app/${context.tenantSlug}/inventory/availability`);
    revalidatePath(`/app/${context.tenantSlug}/products/${productId}`);
    return {
      status: "success",
      message: "Store availability updated.",
      version: result.version,
    };
  } catch (error) {
    return actionErrorState(error);
  }
}

export async function updateLowStockAlertPreferencesAction(
  tenantSlug: string,
  _previous: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  try {
    const raw = alertPreferencesFormSchema.parse(Object.fromEntries(formData));
    const context = await requireTenantContext(tenantSlug);
    const result = await new InventoryService().updateLowStockAlertPreferences(
      context,
      {
        enabled: formData.get("enabled") === "on",
        includeLowStock: formData.get("includeLowStock") === "on",
        includeOutOfStock: formData.get("includeOutOfStock") === "on",
        expectedVersion: raw.expectedVersion,
      },
    );
    revalidateInventory(context.tenantSlug);
    revalidatePath(`/app/${context.tenantSlug}/inventory/alerts`);
    return {
      status: "success",
      message: "Low-stock alert policy updated.",
      version: result.version,
    };
  } catch (error) {
    return actionErrorState(error);
  }
}
