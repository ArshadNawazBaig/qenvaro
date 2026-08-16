"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseDecimalToMinor } from "@/lib/money";
import { BillingAccessError } from "@/modules/billing/entitlements";
import { PermissionError } from "@/modules/permissions/permissions";
import {
  ProductArchivedError,
  ProductCategoryUnavailableError,
  ProductNotFoundError,
  ProductService,
  ProductTagUnavailableError,
  ProductUnitUnavailableError,
  ProductVersionConflictError,
} from "@/modules/products/service";
import { productTagIdsSchema } from "@/modules/tags/schemas";
import { unitIdSchema } from "@/modules/units/schemas";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

const formSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/),
  category: z.string().trim().min(2).max(80),
  unitId: unitIdSchema,
  price: z.string().trim(),
  stock: z.coerce.number().int().min(0).max(1_000_000),
  tagIds: productTagIdsSchema,
});

const updateFormSchema = z
  .object({
    expectedVersion: z.coerce.number().int().min(1),
    name: z.string().trim().min(2).max(120),
    subtitle: z.string().trim().max(160),
    sku: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/),
    category: z.string().trim().min(2).max(80),
    unitId: unitIdSchema,
    price: z.string().trim(),
    reorderLevel: z.coerce.number().int().min(0).max(1_000_000),
    status: z.enum(["draft", "active"]),
    tagIds: productTagIdsSchema,
  })
  .strict();

const archiveFormSchema = z
  .object({ expectedVersion: z.coerce.number().int().min(1) })
  .strict();

export interface ProductActionState {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
  version?: number;
}

function actionErrorState(error: unknown): ProductActionState {
  if (error instanceof z.ZodError)
    return {
      status: "error",
      message: error.issues[0]?.message ?? "Check the product fields.",
    };
  if (error instanceof ProductVersionConflictError)
    return {
      status: "conflict",
      message:
        "This product changed in another session. Reload before retrying.",
    };
  if (error instanceof ProductArchivedError)
    return { status: "error", message: error.message };
  if (error instanceof ProductCategoryUnavailableError)
    return { status: "error", message: error.message };
  if (error instanceof ProductTagUnavailableError)
    return { status: "error", message: error.message };
  if (error instanceof ProductUnitUnavailableError)
    return { status: "error", message: error.message };
  if (error instanceof ProductNotFoundError)
    return { status: "error", message: "Product not found or unavailable." };
  if (error instanceof PermissionError)
    return { status: "error", message: error.message };
  if (error instanceof BillingAccessError)
    return { status: "error", message: error.message };
  if (
    error instanceof Error &&
    error.name === "MongoServerError" &&
    "code" in error &&
    error.code === 11000
  )
    return { status: "error", message: "That SKU is already in use." };
  if (
    error instanceof Error &&
    error.message.startsWith("Enter a valid amount")
  )
    return { status: "error", message: error.message };
  return {
    status: "error",
    message: "The product change could not be completed. Try again.",
  };
}

export async function createProductAction(
  tenantSlug: string,
  _previous: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = formSchema.parse({
      name: formData.get("name"),
      sku: formData.get("sku"),
      category: formData.get("category"),
      unitId: formData.get("unitId"),
      price: formData.get("price"),
      stock: formData.get("stock"),
      tagIds: formData.getAll("tagIds"),
    });
    await new ProductService().createSimple(context, {
      name: input.name,
      sku: input.sku,
      category: input.category,
      unitId: input.unitId,
      priceMinor: parseDecimalToMinor(input.price),
      openingStock: input.stock,
      tagIds: input.tagIds,
    });
    revalidatePath(`/app/${context.tenantSlug}/products`);
    return { status: "success", message: "Product created." };
  } catch (error) {
    return actionErrorState(error);
  }
}

export async function updateProductAction(
  tenantSlug: string,
  productId: string,
  _previous: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = updateFormSchema.parse({
      expectedVersion: formData.get("expectedVersion"),
      name: formData.get("name"),
      subtitle: formData.get("subtitle"),
      sku: formData.get("sku"),
      category: formData.get("category"),
      unitId: formData.get("unitId"),
      price: formData.get("price"),
      reorderLevel: formData.get("reorderLevel"),
      status: formData.get("status"),
      tagIds: formData.getAll("tagIds"),
    });
    const result = await new ProductService().update(context, {
      productId,
      expectedVersion: input.expectedVersion,
      name: input.name,
      subtitle: input.subtitle,
      sku: input.sku,
      category: input.category,
      unitId: input.unitId,
      priceMinor: parseDecimalToMinor(input.price),
      reorderLevel: input.reorderLevel,
      status: input.status,
      tagIds: input.tagIds,
    });
    revalidatePath(`/app/${context.tenantSlug}/products`);
    revalidatePath(`/app/${context.tenantSlug}/products/${productId}`);
    return {
      status: "success",
      message: "Product details updated.",
      version: result.version,
    };
  } catch (error) {
    return actionErrorState(error);
  }
}

export async function archiveProductAction(
  tenantSlug: string,
  productId: string,
  _previous: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = archiveFormSchema.parse({
      expectedVersion: formData.get("expectedVersion"),
    });
    const result = await new ProductService().archive(context, {
      productId,
      expectedVersion: input.expectedVersion,
    });
    revalidatePath(`/app/${context.tenantSlug}/products`);
    revalidatePath(`/app/${context.tenantSlug}/products/${productId}`);
    return {
      status: "success",
      message: result.alreadyArchived
        ? "Product is already archived."
        : "Product archived. Inventory was not changed.",
      version: result.version,
    };
  } catch (error) {
    return actionErrorState(error);
  }
}
