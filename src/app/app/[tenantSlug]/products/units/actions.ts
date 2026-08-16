"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BillingAccessError } from "@/modules/billing/entitlements";
import { PermissionError } from "@/modules/permissions/permissions";
import {
  UnitArchivedError,
  UnitDuplicateError,
  UnitInUseError,
  UnitNotFoundError,
  UnitService,
  UnitVersionConflictError,
} from "@/modules/units/service";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

const unitFieldsSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    symbol: z.string().trim().min(1).max(16),
    description: z.string().trim().max(240),
  })
  .strict();

const updateFormSchema = unitFieldsSchema.extend({
  expectedVersion: z.coerce.number().int().min(1),
});

const archiveFormSchema = z
  .object({ expectedVersion: z.coerce.number().int().min(1) })
  .strict();

export interface UnitActionState {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
  version?: number;
}

function failure(error: unknown): UnitActionState {
  if (error instanceof z.ZodError)
    return {
      status: "error",
      message: error.issues[0]?.message ?? "Check the unit fields.",
    };
  if (error instanceof UnitVersionConflictError)
    return {
      status: "conflict",
      message: "This unit changed in another session. Reload before retrying.",
    };
  if (error instanceof UnitDuplicateError || error instanceof UnitArchivedError)
    return { status: "error", message: error.message };
  if (error instanceof UnitInUseError)
    return {
      status: "error",
      message: `Reassign the ${error.productCount} active product${error.productCount === 1 ? "" : "s"} using this unit before archiving it.`,
    };
  if (error instanceof UnitNotFoundError)
    return { status: "error", message: "Unit not found or unavailable." };
  if (error instanceof PermissionError || error instanceof BillingAccessError)
    return { status: "error", message: error.message };
  if (
    error instanceof Error &&
    error.name === "MongoServerError" &&
    "code" in error &&
    error.code === 11000
  )
    return {
      status: "error",
      message: "A unit with that name or symbol already exists.",
    };
  return {
    status: "error",
    message: "The unit change could not be completed. Try again.",
  };
}

function revalidateUnitViews(tenantSlug: string) {
  revalidatePath(`/app/${tenantSlug}/products`);
  revalidatePath(`/app/${tenantSlug}/products/units`);
}

export async function createUnitAction(
  tenantSlug: string,
  _previous: UnitActionState,
  formData: FormData,
): Promise<UnitActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = unitFieldsSchema.parse({
      name: formData.get("name"),
      symbol: formData.get("symbol"),
      description: formData.get("description"),
    });
    const result = await new UnitService().create(context, input);
    revalidateUnitViews(context.tenantSlug);
    return {
      status: "success",
      message: "Unit created.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateUnitAction(
  tenantSlug: string,
  unitId: string,
  _previous: UnitActionState,
  formData: FormData,
): Promise<UnitActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = updateFormSchema.parse({
      expectedVersion: formData.get("expectedVersion"),
      name: formData.get("name"),
      symbol: formData.get("symbol"),
      description: formData.get("description"),
    });
    const result = await new UnitService().update(context, {
      unitId,
      expectedVersion: input.expectedVersion,
      name: input.name,
      symbol: input.symbol,
      description: input.description,
    });
    revalidateUnitViews(context.tenantSlug);
    return {
      status: "success",
      message: "Unit updated.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function archiveUnitAction(
  tenantSlug: string,
  unitId: string,
  _previous: UnitActionState,
  formData: FormData,
): Promise<UnitActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = archiveFormSchema.parse({
      expectedVersion: formData.get("expectedVersion"),
    });
    const result = await new UnitService().archive(context, {
      unitId,
      expectedVersion: input.expectedVersion,
    });
    revalidateUnitViews(context.tenantSlug);
    return {
      status: "success",
      message: result.alreadyArchived
        ? "Unit is already archived."
        : "Unit archived.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}
