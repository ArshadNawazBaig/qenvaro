"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BillingAccessError } from "@/modules/billing/entitlements";
import {
  InventoryNegativeStockError,
  InventoryProductUnavailableError,
  InventoryStoreUnavailableError,
  InventoryVersionConflictError,
} from "@/modules/inventory/service";
import { PermissionError } from "@/modules/permissions/permissions";
import {
  SaleCalculationError,
  SalePaymentMismatchError,
} from "@/modules/sales/policy";
import {
  saleDraftLineSchema,
  salePaymentInputSchema,
} from "@/modules/sales/schemas";
import {
  SaleCustomerUnavailableError,
  SaleIdempotencyConflictError,
  SaleNotFoundError,
  SaleProductUnavailableError,
  SaleService,
  SaleStoreUnavailableError,
} from "@/modules/sales/service";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

const saleFormSchema = z.object({
  storeId: z.string().trim().min(1).max(160),
  customerId: z.string().trim().max(160),
  linesJson: z.string().trim().min(2).max(100_000),
  paymentsJson: z.string().trim().min(2).max(10_000),
  note: z.string().trim().max(500),
  idempotencyKey: z.string().trim().min(1).max(160),
});

export interface SaleActionState {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
  saleId?: string;
  receiptNumber?: string;
}

function failure(error: unknown): SaleActionState {
  if (error instanceof z.ZodError)
    return {
      status: "error",
      message: error.issues[0]?.message ?? "Check the sale details.",
    };
  if (error instanceof SyntaxError)
    return { status: "error", message: "The sale draft is invalid." };
  if (error instanceof InventoryVersionConflictError)
    return {
      status: "conflict",
      message:
        "Stock changed while this sale was open. Reload before retrying.",
    };
  if (
    error instanceof InventoryNegativeStockError ||
    error instanceof InventoryProductUnavailableError ||
    error instanceof InventoryStoreUnavailableError ||
    error instanceof SaleProductUnavailableError ||
    error instanceof SaleCustomerUnavailableError ||
    error instanceof SaleStoreUnavailableError ||
    error instanceof SalePaymentMismatchError ||
    error instanceof SaleCalculationError ||
    error instanceof SaleIdempotencyConflictError ||
    error instanceof PermissionError ||
    error instanceof BillingAccessError
  )
    return { status: "error", message: error.message };
  if (error instanceof SaleNotFoundError)
    return { status: "error", message: "Sale workspace not found." };
  return {
    status: "error",
    message:
      "The sale could not be completed. No payment or stock was recorded.",
  };
}

export async function completeSaleAction(
  tenantSlug: string,
  _previous: SaleActionState,
  formData: FormData,
): Promise<SaleActionState> {
  try {
    const raw = saleFormSchema.parse(Object.fromEntries(formData));
    const lines = z
      .array(saleDraftLineSchema)
      .min(1)
      .max(50)
      .parse(JSON.parse(raw.linesJson) as unknown);
    const payments = z
      .array(salePaymentInputSchema)
      .min(1)
      .max(6)
      .parse(JSON.parse(raw.paymentsJson) as unknown);
    const context = await requireTenantContext(tenantSlug);
    const result = await new SaleService().complete(context, {
      storeId: raw.storeId,
      customerId: raw.customerId,
      lines,
      payments,
      note: raw.note,
      idempotencyKey: raw.idempotencyKey,
    });
    revalidatePath(`/app/${context.tenantSlug}`);
    revalidatePath(`/app/${context.tenantSlug}/inventory`);
    revalidatePath(`/app/${context.tenantSlug}/products`);
    revalidatePath(`/app/${context.tenantSlug}/sales/new`);
    return {
      status: "success",
      message: result.idempotent
        ? `${result.receiptNumber} was already completed.`
        : `${result.receiptNumber} completed.`,
      saleId: result.id,
      receiptNumber: result.receiptNumber,
    };
  } catch (error) {
    return failure(error);
  }
}
