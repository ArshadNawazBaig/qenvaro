"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PlanLimitError } from "@/config/plans";
import { BillingAccessError } from "@/modules/billing/entitlements";
import { PermissionError } from "@/modules/permissions/permissions";
import {
  archiveStoreSchema,
  businessSettingsSchema,
  createStoreSchema,
  dataRequestSchema,
  operationSettingsSchema,
  updateStoreSchema,
} from "@/modules/settings/schemas";
import {
  SettingsConflictError,
  SettingsDomainError,
  TenantSettingsService,
} from "@/modules/settings/service";
import { TenantNotFoundError } from "@/server/tenancy/context";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export interface SettingsActionState {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
  version?: number;
}

function failure(error: unknown): SettingsActionState {
  if (error instanceof SettingsConflictError)
    return { status: "conflict", message: error.message };
  if (
    error instanceof SettingsDomainError ||
    error instanceof PermissionError ||
    error instanceof BillingAccessError ||
    error instanceof PlanLimitError
  )
    return { status: "error", message: error.message };
  if (error instanceof TenantNotFoundError)
    return {
      status: "error",
      message: "The requested setting is unavailable.",
    };
  if (error instanceof z.ZodError)
    return {
      status: "error",
      message: error.issues[0]?.message ?? "Review the submitted settings.",
    };
  return {
    status: "error",
    message: "The settings change could not be completed. Try again.",
  };
}

function refresh(tenantSlug: string) {
  revalidatePath(`/app/${tenantSlug}`);
  revalidatePath(`/app/${tenantSlug}/settings/business`);
  revalidatePath(`/app/${tenantSlug}/settings/stores`);
  revalidatePath(`/app/${tenantSlug}/settings/security`);
}

export async function updateBusinessSettingsAction(
  tenantSlug: string,
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = businessSettingsSchema.parse({
      businessName: formData.get("businessName"),
      legalName: formData.get("legalName"),
      supportEmail: formData.get("supportEmail"),
      phone: formData.get("phone"),
      address: formData.get("address"),
      locale: formData.get("locale"),
      timezone: formData.get("timezone"),
      currency: formData.get("currency"),
      expectedVersion: Number(formData.get("expectedVersion")),
    });
    const result = await new TenantSettingsService().updateBusiness(
      context,
      input,
    );
    refresh(context.tenantSlug);
    return {
      status: "success",
      message: "Business settings updated.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateOperationSettingsAction(
  tenantSlug: string,
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = operationSettingsSchema.parse({
      defaultTaxRateBps: Math.round(
        Number(formData.get("defaultTaxPercent")) * 100,
      ),
      pricesIncludeTax: formData.get("pricesIncludeTax") === "on",
      receiptPrefix: formData.get("receiptPrefix"),
      returnPrefix: formData.get("returnPrefix"),
      purchasePrefix: formData.get("purchasePrefix"),
      expensePrefix: formData.get("expensePrefix"),
      allowNegativeStock: formData.get("allowNegativeStock") === "on",
      expectedVersion: Number(formData.get("expectedVersion")),
    });
    const result = await new TenantSettingsService().updateOperations(
      context,
      input,
    );
    refresh(context.tenantSlug);
    return {
      status: "success",
      message: "Operational policies updated.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

function storeFields(formData: FormData) {
  return {
    name: formData.get("name"),
    code: formData.get("code"),
    timezone: formData.get("timezone"),
    address: formData.get("address"),
  };
}

export async function createStoreAction(
  tenantSlug: string,
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const result = await new TenantSettingsService().createStore(
      context,
      createStoreSchema.parse(storeFields(formData)),
    );
    refresh(context.tenantSlug);
    return {
      status: "success",
      message: "Store created.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateStoreAction(
  tenantSlug: string,
  storeId: string,
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const result = await new TenantSettingsService().updateStore(
      context,
      updateStoreSchema.parse({
        ...storeFields(formData),
        storeId,
        expectedVersion: Number(formData.get("expectedVersion")),
      }),
    );
    refresh(context.tenantSlug);
    return {
      status: "success",
      message: "Store updated.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function archiveStoreAction(
  tenantSlug: string,
  storeId: string,
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const result = await new TenantSettingsService().archiveStore(
      context,
      archiveStoreSchema.parse({
        storeId,
        expectedVersion: Number(formData.get("expectedVersion")),
      }),
    );
    refresh(context.tenantSlug);
    return {
      status: "success",
      message: result.unchanged
        ? "Store is already archived."
        : "Store archived.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function requestDataOperationAction(
  tenantSlug: string,
  type: "export" | "deletion",
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    await new TenantSettingsService().requestDataOperation(
      context,
      dataRequestSchema.parse({
        type,
        confirmation: formData.get("confirmation"),
      }),
    );
    refresh(context.tenantSlug);
    return {
      status: "success",
      message: `${type === "export" ? "Export" : "Deletion"} request submitted for controlled review.`,
    };
  } catch (error) {
    return failure(error);
  }
}
