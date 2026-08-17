"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseDecimalToMinor } from "@/lib/money";
import {
  BillingAccessError,
  FeatureAccessError,
} from "@/modules/billing/entitlements";
import { PermissionError } from "@/modules/permissions/permissions";
import {
  archiveSupplierSchema,
  createExpenseSchema,
  createPurchaseOrderSchema,
  createSupplierSchema,
  decideExpenseSchema,
  receivePurchaseOrderSchema,
  transitionPurchaseOrderSchema,
  updateSupplierSchema,
} from "@/modules/purchasing/schemas";
import {
  ExpenseService,
  PurchaseOrderService,
  PurchasingConflictError,
  PurchasingDomainError,
  PurchasingNotFoundError,
  SupplierService,
} from "@/modules/purchasing/service";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export interface PurchasingActionState {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
  version?: number;
}

function supplierFields(formData: FormData) {
  return {
    name: formData.get("name"),
    contactName: formData.get("contactName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    taxNumber: formData.get("taxNumber"),
    paymentTerms: formData.get("paymentTerms"),
    notes: formData.get("notes"),
  };
}

function failure(error: unknown): PurchasingActionState {
  if (error instanceof PurchasingConflictError)
    return { status: "conflict", message: error.message };
  if (
    error instanceof PurchasingDomainError ||
    error instanceof PurchasingNotFoundError ||
    error instanceof PermissionError ||
    error instanceof BillingAccessError ||
    error instanceof FeatureAccessError
  )
    return { status: "error", message: error.message };
  if (error instanceof z.ZodError)
    return {
      status: "error",
      message: error.issues[0]?.message ?? "Review the submitted values.",
    };
  if (error instanceof Error && /valid amount/i.test(error.message))
    return { status: "error", message: error.message };
  return {
    status: "error",
    message: "The purchasing change could not be completed. Try again.",
  };
}

function refresh(tenantSlug: string) {
  revalidatePath(`/app/${tenantSlug}`);
  revalidatePath(`/app/${tenantSlug}/suppliers`);
  revalidatePath(`/app/${tenantSlug}/purchases`);
  revalidatePath(`/app/${tenantSlug}/expenses`);
  revalidatePath(`/app/${tenantSlug}/reports/operations`);
  revalidatePath(`/app/${tenantSlug}/inventory`);
}

export async function createSupplierAction(
  tenantSlug: string,
  _previous: PurchasingActionState,
  formData: FormData,
): Promise<PurchasingActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const result = await new SupplierService().create(
      context,
      createSupplierSchema.parse(supplierFields(formData)),
    );
    refresh(context.tenantSlug);
    return {
      status: "success",
      message: `Supplier ${result.supplierCode} created.`,
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateSupplierAction(
  tenantSlug: string,
  supplierId: string,
  _previous: PurchasingActionState,
  formData: FormData,
): Promise<PurchasingActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const result = await new SupplierService().update(
      context,
      updateSupplierSchema.parse({
        ...supplierFields(formData),
        supplierId,
        expectedVersion: Number(formData.get("expectedVersion")),
      }),
    );
    refresh(context.tenantSlug);
    return {
      status: "success",
      message: "Supplier updated.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function archiveSupplierAction(
  tenantSlug: string,
  supplierId: string,
  _previous: PurchasingActionState,
  formData: FormData,
): Promise<PurchasingActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const result = await new SupplierService().archive(
      context,
      archiveSupplierSchema.parse({
        supplierId,
        expectedVersion: Number(formData.get("expectedVersion")),
      }),
    );
    refresh(context.tenantSlug);
    return {
      status: "success",
      message: result.unchanged
        ? "Supplier is already archived."
        : "Supplier archived.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function createPurchaseOrderAction(
  tenantSlug: string,
  _previous: PurchasingActionState,
  formData: FormData,
): Promise<PurchasingActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const rawLines: unknown = JSON.parse(String(formData.get("lines") ?? "[]"));
    const lines = z
      .array(
        z.object({
          variantId: z.string(),
          quantity: z.number(),
          unitCost: z.string(),
          taxRateBps: z.number(),
        }),
      )
      .parse(rawLines)
      .map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        unitCostMinor: parseDecimalToMinor(line.unitCost),
        taxRateBps: line.taxRateBps,
      }));
    const input = createPurchaseOrderSchema.parse({
      supplierId: formData.get("supplierId"),
      storeId: formData.get("storeId"),
      expectedDeliveryDate: formData.get("expectedDeliveryDate"),
      note: formData.get("note"),
      lines,
      idempotencyKey: formData.get("idempotencyKey"),
    });
    const result = await new PurchaseOrderService().create(context, input);
    refresh(context.tenantSlug);
    return {
      status: "success",
      message: result.replayed
        ? `${result.purchaseOrderNumber} already created.`
        : `${result.purchaseOrderNumber} created.`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function transitionPurchaseOrderAction(
  tenantSlug: string,
  purchaseOrderId: string,
  targetStatus: "submitted" | "approved" | "cancelled",
  _previous: PurchasingActionState,
  formData: FormData,
): Promise<PurchasingActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const result = await new PurchaseOrderService().transition(
      context,
      transitionPurchaseOrderSchema.parse({
        purchaseOrderId,
        expectedVersion: Number(formData.get("expectedVersion")),
        targetStatus,
        reason: formData.get("reason") ?? "",
      }),
    );
    refresh(context.tenantSlug);
    return {
      status: "success",
      message: `Purchase order moved to ${result.status}.`,
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function receivePurchaseOrderAction(
  tenantSlug: string,
  purchaseOrderId: string,
  _previous: PurchasingActionState,
  formData: FormData,
): Promise<PurchasingActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const rawLines: unknown = JSON.parse(String(formData.get("lines") ?? "[]"));
    const input = receivePurchaseOrderSchema.parse({
      purchaseOrderId,
      expectedVersion: Number(formData.get("expectedVersion")),
      receivedAt: new Date().toISOString(),
      note: formData.get("note"),
      lines: rawLines,
      idempotencyKey: formData.get("idempotencyKey"),
    });
    const result = await new PurchaseOrderService().receive(context, input);
    refresh(context.tenantSlug);
    return {
      status: "success",
      message: result.replayed
        ? `${result.goodsReceiptNumber} already received.`
        : `${result.goodsReceiptNumber} received; order is ${result.status}.`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function createExpenseAction(
  tenantSlug: string,
  _previous: PurchasingActionState,
  formData: FormData,
): Promise<PurchasingActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = createExpenseSchema.parse({
      storeId: formData.get("storeId"),
      category: formData.get("category"),
      vendor: formData.get("vendor"),
      expenseDate: formData.get("expenseDate"),
      amountMinor: parseDecimalToMinor(String(formData.get("amount") ?? "")),
      notes: formData.get("notes"),
      receiptUrl: "",
      idempotencyKey: formData.get("idempotencyKey"),
    });
    const result = await new ExpenseService().create(context, input);
    refresh(context.tenantSlug);
    return {
      status: "success",
      message: result.replayed
        ? `${result.expenseNumber} already submitted.`
        : `${result.expenseNumber} submitted.`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function decideExpenseAction(
  tenantSlug: string,
  expenseId: string,
  decision: "approved" | "rejected",
  _previous: PurchasingActionState,
  formData: FormData,
): Promise<PurchasingActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const result = await new ExpenseService().decide(
      context,
      decideExpenseSchema.parse({
        expenseId,
        expectedVersion: Number(formData.get("expectedVersion")),
        decision,
        note: formData.get("note") ?? "",
      }),
    );
    refresh(context.tenantSlug);
    return {
      status: "success",
      message: `Expense ${result.status}.`,
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}
