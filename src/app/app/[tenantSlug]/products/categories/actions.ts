"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BillingAccessError } from "@/modules/billing/entitlements";
import {
  CategoryArchivedError,
  CategoryDuplicateError,
  CategoryInUseError,
  CategoryNotFoundError,
  CategoryService,
  CategoryVersionConflictError,
} from "@/modules/categories/service";
import { PermissionError } from "@/modules/permissions/permissions";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

const categoryFields = {
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500),
};

const createFormSchema = z.object(categoryFields).strict();
const updateFormSchema = z
  .object({
    ...categoryFields,
    expectedVersion: z.coerce.number().int().min(1),
  })
  .strict();
const archiveFormSchema = z
  .object({ expectedVersion: z.coerce.number().int().min(1) })
  .strict();

export interface CategoryActionState {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
  version?: number;
}

function failure(error: unknown): CategoryActionState {
  if (error instanceof z.ZodError)
    return {
      status: "error",
      message: error.issues[0]?.message ?? "Check the category fields.",
    };
  if (error instanceof CategoryVersionConflictError)
    return {
      status: "conflict",
      message:
        "This category changed in another session. Reload before retrying.",
    };
  if (error instanceof CategoryDuplicateError)
    return { status: "error", message: error.message };
  if (error instanceof CategoryArchivedError)
    return { status: "error", message: error.message };
  if (error instanceof CategoryNotFoundError)
    return { status: "error", message: "Category not found or unavailable." };
  if (error instanceof CategoryInUseError)
    return {
      status: "error",
      message: `Reassign or archive ${error.productCount} active product${error.productCount === 1 ? "" : "s"} before archiving this category.`,
    };
  if (error instanceof BillingAccessError || error instanceof PermissionError)
    return { status: "error", message: error.message };
  if (
    error instanceof Error &&
    error.name === "MongoServerError" &&
    "code" in error &&
    error.code === 11000
  )
    return {
      status: "error",
      message: "A category with that name already exists.",
    };
  return {
    status: "error",
    message: "The category change could not be completed. Try again.",
  };
}

function revalidateCategoryViews(tenantSlug: string): void {
  revalidatePath(`/app/${tenantSlug}/products/categories`);
  revalidatePath(`/app/${tenantSlug}/products`);
}

export async function createCategoryAction(
  tenantSlug: string,
  _previous: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = createFormSchema.parse(Object.fromEntries(formData));
    const result = await new CategoryService().create(context, input);
    revalidateCategoryViews(context.tenantSlug);
    return {
      status: "success",
      message: "Category created.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateCategoryAction(
  tenantSlug: string,
  categoryId: string,
  _previous: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = updateFormSchema.parse(Object.fromEntries(formData));
    const result = await new CategoryService().update(context, {
      categoryId,
      expectedVersion: input.expectedVersion,
      name: input.name,
      description: input.description,
    });
    revalidateCategoryViews(context.tenantSlug);
    return {
      status: "success",
      message:
        result.updatedProductCount > 0
          ? `Category updated across ${result.updatedProductCount} product${result.updatedProductCount === 1 ? "" : "s"}.`
          : "Category updated.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function archiveCategoryAction(
  tenantSlug: string,
  categoryId: string,
  _previous: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = archiveFormSchema.parse(Object.fromEntries(formData));
    const result = await new CategoryService().archive(context, {
      categoryId,
      expectedVersion: input.expectedVersion,
    });
    revalidateCategoryViews(context.tenantSlug);
    return {
      status: "success",
      message: result.alreadyArchived
        ? "Category is already archived."
        : "Category archived.",
      version: result.version,
    };
  } catch (error) {
    return failure(error);
  }
}
