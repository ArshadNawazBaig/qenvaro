"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BillingAccessError } from "@/modules/billing/entitlements";
import {
  InventoryProductUnavailableError,
  InventoryStoreUnavailableError,
  InventoryVersionConflictError,
} from "@/modules/inventory/service";
import { PermissionError } from "@/modules/permissions/permissions";
import {
  SaleReturnCalculationError,
  SaleReturnQuantityError,
} from "@/modules/sales/return-policy";
import {
  saleReturnLineInputSchema,
  saleReturnReasonSchema,
} from "@/modules/sales/return-schemas";
import {
  SaleReturnIdempotencyConflictError,
  SaleReturnNotFoundError,
  SaleReturnService,
  SaleReturnStoreUnavailableError,
} from "@/modules/sales/return-service";
import { salePaymentMethodSchema } from "@/modules/sales/schemas";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

const returnFormSchema = z.object({
  saleId: z.string().trim().min(1).max(160),
  storeId: z.string().trim().min(1).max(160),
  linesJson: z.string().trim().min(2).max(100_000),
  refundMethod: salePaymentMethodSchema,
  reason: saleReturnReasonSchema,
  note: z.string().trim().max(500),
  idempotencyKey: z.string().trim().min(1).max(160),
});

export interface SaleReturnActionState {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
  returnId?: string;
  saleId?: string;
  returnNumber?: string;
}

function failure(error: unknown): SaleReturnActionState {
  if (error instanceof z.ZodError)
    return {
      status: "error",
      message: error.issues[0]?.message ?? "Check the return details.",
    };
  if (error instanceof SyntaxError)
    return { status: "error", message: "The return draft is invalid." };
  if (error instanceof InventoryVersionConflictError)
    return {
      status: "conflict",
      message:
        "Stock changed while this return was open. Reload before retrying.",
    };
  if (
    error instanceof InventoryProductUnavailableError ||
    error instanceof InventoryStoreUnavailableError ||
    error instanceof SaleReturnCalculationError ||
    error instanceof SaleReturnQuantityError ||
    error instanceof SaleReturnIdempotencyConflictError ||
    error instanceof SaleReturnStoreUnavailableError ||
    error instanceof PermissionError ||
    error instanceof BillingAccessError
  )
    return { status: "error", message: error.message };
  if (error instanceof SaleReturnNotFoundError)
    return { status: "error", message: "The completed sale is unavailable." };
  return {
    status: "error",
    message:
      "The return could not be completed. No refund or stock was recorded.",
  };
}

export async function completeSaleReturnAction(
  tenantSlug: string,
  _previous: SaleReturnActionState,
  formData: FormData,
): Promise<SaleReturnActionState> {
  try {
    const raw = returnFormSchema.parse(Object.fromEntries(formData));
    const lines = z
      .array(saleReturnLineInputSchema)
      .min(1)
      .max(50)
      .parse(JSON.parse(raw.linesJson) as unknown);
    const context = await requireTenantContext(tenantSlug);
    const result = await new SaleReturnService().complete(context, {
      saleId: raw.saleId,
      storeId: raw.storeId,
      lines,
      refundMethod: raw.refundMethod,
      reason: raw.reason,
      note: raw.note,
      idempotencyKey: raw.idempotencyKey,
    });
    revalidatePath(`/app/${context.tenantSlug}`);
    revalidatePath(`/app/${context.tenantSlug}/sales`);
    revalidatePath(`/app/${context.tenantSlug}/sales/${result.saleId}`);
    revalidatePath(`/app/${context.tenantSlug}/inventory`);
    revalidatePath(`/app/${context.tenantSlug}/products`);
    return {
      status: "success",
      message: result.idempotent
        ? `${result.returnNumber} was already completed.`
        : `${result.returnNumber} completed.`,
      returnId: result.id,
      saleId: result.saleId,
      returnNumber: result.returnNumber,
    };
  } catch (error) {
    return failure(error);
  }
}
