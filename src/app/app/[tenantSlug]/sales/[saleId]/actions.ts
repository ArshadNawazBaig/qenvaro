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
  SaleIdempotencyConflictError,
  SaleNotFoundError,
  SaleService,
  SaleVoidConfirmationError,
  SaleVoidConflictError,
  SaleVoidPaymentError,
} from "@/modules/sales/service";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

const formSchema = z.object({
  confirmationReceiptNumber: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(3).max(500),
});

export interface VoidSaleActionState {
  status: "idle" | "success" | "error";
  message: string;
}

export async function voidSaleAction(
  tenantSlug: string,
  saleId: string,
  _previous: VoidSaleActionState,
  formData: FormData,
): Promise<VoidSaleActionState> {
  try {
    const input = formSchema.parse(Object.fromEntries(formData));
    const context = await requireTenantContext(tenantSlug);
    const result = await new SaleService().void(context, { saleId, ...input });
    for (const path of [
      `/app/${context.tenantSlug}`,
      `/app/${context.tenantSlug}/inventory`,
      `/app/${context.tenantSlug}/products`,
      `/app/${context.tenantSlug}/sales`,
      `/app/${context.tenantSlug}/sales/${saleId}`,
      `/app/${context.tenantSlug}/reports/sales`,
    ])
      revalidatePath(path);
    return {
      status: "success",
      message: result.alreadyVoided
        ? `${result.receiptNumber} is already voided.`
        : `${result.receiptNumber} voided and tracked inventory restored.`,
    };
  } catch (error) {
    if (error instanceof z.ZodError)
      return {
        status: "error",
        message: error.issues[0]?.message ?? "Review the void details.",
      };
    if (
      error instanceof SaleVoidConfirmationError ||
      error instanceof SaleVoidConflictError ||
      error instanceof SaleVoidPaymentError ||
      error instanceof InventoryProductUnavailableError ||
      error instanceof InventoryStoreUnavailableError ||
      error instanceof InventoryVersionConflictError ||
      error instanceof SaleIdempotencyConflictError ||
      error instanceof PermissionError ||
      error instanceof BillingAccessError
    )
      return { status: "error", message: error.message };
    if (error instanceof SaleNotFoundError)
      return { status: "error", message: "Sale not found or unavailable." };
    return {
      status: "error",
      message: "The sale could not be voided. No records were changed.",
    };
  }
}
