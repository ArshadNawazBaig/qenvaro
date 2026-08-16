"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseDecimalToMinor } from "@/lib/money";
import { BillingAccessError } from "@/modules/billing/entitlements";
import { PermissionError } from "@/modules/permissions/permissions";
import { variantSkuSchema } from "@/modules/variants/schemas";
import {
  DefaultVariantImmutableError,
  OptionConfigurationLockedError,
  OptionGroupDuplicateError,
  OptionGroupInUseError,
  OptionGroupLimitError,
  OptionGroupNotFoundError,
  OptionSelectionInvalidError,
  OptionValueDuplicateError,
  OptionValueLimitError,
  ProductOptionVersionConflictError,
  VariantArchivedError,
  VariantCombinationDuplicateError,
  VariantHasInventoryError,
  VariantNotFoundError,
  VariantProductArchivedError,
  VariantProductNotFoundError,
  VariantService,
  VariantSkuDuplicateError,
  VariantVersionConflictError,
} from "@/modules/variants/service";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

const optionGroupFormSchema = z
  .object({
    expectedProductVersion: z.coerce.number().int().min(1),
    name: z.string().trim().min(2).max(40),
    values: z.string().trim().max(840),
  })
  .strict();

const updateOptionGroupFormSchema = z
  .object({
    expectedProductVersion: z.coerce.number().int().min(1),
    name: z.string().trim().min(2).max(40),
    newValues: z.string().trim().max(840),
  })
  .strict();

const versionFormSchema = z
  .object({ expectedVersion: z.coerce.number().int().min(1) })
  .strict();

const variantFormSchema = z
  .object({
    expectedProductVersion: z.coerce.number().int().min(1),
    sku: variantSkuSchema,
    price: z.string().trim(),
  })
  .strict();

const updateVariantFormSchema = z
  .object({
    expectedVariantVersion: z.coerce.number().int().min(1),
    sku: variantSkuSchema,
    price: z.string().trim(),
  })
  .strict();

export interface VariantActionState {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
  version?: number;
}

function parseValues(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function failure(error: unknown): VariantActionState {
  if (error instanceof z.ZodError)
    return {
      status: "error",
      message: error.issues[0]?.message ?? "Check the variant fields.",
    };
  if (
    error instanceof ProductOptionVersionConflictError ||
    error instanceof VariantVersionConflictError
  )
    return {
      status: "conflict",
      message:
        "This product changed in another session. Reload before retrying.",
    };
  if (error instanceof OptionGroupInUseError)
    return {
      status: "error",
      message: `Archive the ${error.variantCount} active variant${error.variantCount === 1 ? "" : "s"} using this option first.`,
    };
  if (
    error instanceof OptionGroupDuplicateError ||
    error instanceof OptionValueDuplicateError ||
    error instanceof OptionConfigurationLockedError ||
    error instanceof OptionGroupLimitError ||
    error instanceof OptionValueLimitError ||
    error instanceof OptionSelectionInvalidError ||
    error instanceof VariantCombinationDuplicateError ||
    error instanceof VariantSkuDuplicateError ||
    error instanceof VariantHasInventoryError ||
    error instanceof DefaultVariantImmutableError ||
    error instanceof VariantArchivedError ||
    error instanceof VariantProductArchivedError
  )
    return { status: "error", message: error.message };
  if (
    error instanceof OptionGroupNotFoundError ||
    error instanceof VariantNotFoundError ||
    error instanceof VariantProductNotFoundError
  )
    return {
      status: "error",
      message: "Product option or variant not found or unavailable.",
    };
  if (error instanceof PermissionError || error instanceof BillingAccessError)
    return { status: "error", message: error.message };
  if (
    error instanceof Error &&
    error.name === "MongoServerError" &&
    "code" in error &&
    error.code === 11000
  ) {
    const duplicate = error as Error & {
      keyPattern?: Record<string, number>;
    };
    return {
      status: "error",
      message: duplicate.keyPattern?.optionSignature
        ? "That option combination already has a variant."
        : "That SKU is already used by another variant.",
    };
  }
  if (
    error instanceof Error &&
    error.message.startsWith("Enter a valid amount")
  )
    return { status: "error", message: error.message };
  return {
    status: "error",
    message: "The variant change could not be completed. Try again.",
  };
}

function revalidateProduct(tenantSlug: string, productId: string) {
  revalidatePath(`/app/${tenantSlug}/products`);
  revalidatePath(`/app/${tenantSlug}/products/${productId}`);
}

export async function createOptionGroupAction(
  tenantSlug: string,
  productId: string,
  _previous: VariantActionState,
  formData: FormData,
): Promise<VariantActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const form = optionGroupFormSchema.parse(Object.fromEntries(formData));
    const result = await new VariantService().createOptionGroup(context, {
      productId,
      expectedProductVersion: form.expectedProductVersion,
      name: form.name,
      values: parseValues(form.values),
    });
    revalidateProduct(context.tenantSlug, productId);
    return {
      status: "success",
      message: "Option group created.",
      version: result.productVersion,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateOptionGroupAction(
  tenantSlug: string,
  productId: string,
  optionGroupId: string,
  _previous: VariantActionState,
  formData: FormData,
): Promise<VariantActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const form = updateOptionGroupFormSchema.parse(
      Object.fromEntries(formData),
    );
    const result = await new VariantService().updateOptionGroup(context, {
      productId,
      optionGroupId,
      expectedProductVersion: form.expectedProductVersion,
      name: form.name,
      newValues: parseValues(form.newValues),
    });
    revalidateProduct(context.tenantSlug, productId);
    return {
      status: "success",
      message: "Option group updated.",
      version: result.productVersion,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function archiveOptionGroupAction(
  tenantSlug: string,
  productId: string,
  optionGroupId: string,
  _previous: VariantActionState,
  formData: FormData,
): Promise<VariantActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const form = versionFormSchema.parse(Object.fromEntries(formData));
    const result = await new VariantService().archiveOptionGroup(context, {
      productId,
      optionGroupId,
      expectedProductVersion: form.expectedVersion,
    });
    revalidateProduct(context.tenantSlug, productId);
    return {
      status: "success",
      message: result.alreadyArchived
        ? "Option group is already archived."
        : "Option group archived.",
      version: result.productVersion,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function createVariantAction(
  tenantSlug: string,
  productId: string,
  _previous: VariantActionState,
  formData: FormData,
): Promise<VariantActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const form = variantFormSchema.parse({
      expectedProductVersion: formData.get("expectedProductVersion"),
      sku: formData.get("sku"),
      price: formData.get("price"),
    });
    const optionValues = formData.getAll("optionValue").map((rawValue) => {
      const [optionId, valueId, ...rest] = String(rawValue).split(":");
      if (!optionId || !valueId || rest.length > 0)
        throw new OptionSelectionInvalidError();
      return { optionId, valueId };
    });
    const result = await new VariantService().createVariant(context, {
      productId,
      expectedProductVersion: form.expectedProductVersion,
      sku: form.sku,
      priceMinor: parseDecimalToMinor(form.price),
      optionValues,
    });
    revalidateProduct(context.tenantSlug, productId);
    return {
      status: "success",
      message: "Variant created with zero opening stock.",
      version: result.productVersion,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateVariantAction(
  tenantSlug: string,
  productId: string,
  variantId: string,
  _previous: VariantActionState,
  formData: FormData,
): Promise<VariantActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const form = updateVariantFormSchema.parse(Object.fromEntries(formData));
    const result = await new VariantService().updateVariant(context, {
      productId,
      variantId,
      expectedVariantVersion: form.expectedVariantVersion,
      sku: form.sku,
      priceMinor: parseDecimalToMinor(form.price),
    });
    revalidateProduct(context.tenantSlug, productId);
    return {
      status: "success",
      message: "Variant updated.",
      version: result.variantVersion,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function archiveVariantAction(
  tenantSlug: string,
  productId: string,
  variantId: string,
  _previous: VariantActionState,
  formData: FormData,
): Promise<VariantActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const form = versionFormSchema.parse(Object.fromEntries(formData));
    const result = await new VariantService().archiveVariant(context, {
      productId,
      variantId,
      expectedVariantVersion: form.expectedVersion,
    });
    revalidateProduct(context.tenantSlug, productId);
    return {
      status: "success",
      message: result.alreadyArchived
        ? "Variant is already archived."
        : "Variant archived. Inventory records were unchanged.",
      version: result.variantVersion,
    };
  } catch (error) {
    return failure(error);
  }
}
