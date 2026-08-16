"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BillingAccessError } from "@/modules/billing/entitlements";
import {
  ProductImageLimitError,
  ProductImageNotFoundError,
  ProductImageProductArchivedError,
  ProductImageProductNotFoundError,
  ProductImageService,
  ProductImageVersionConflictError,
} from "@/modules/product-images/service";
import { PermissionError } from "@/modules/permissions/permissions";
import { deleteProductImage } from "@/server/media/cloudinary";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

const versionFormSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
});

const altTextFormSchema = versionFormSchema.extend({
  altText: z.string().trim().min(2).max(160),
});

const moveFormSchema = versionFormSchema.extend({
  direction: z.enum(["previous", "next"]),
});

export interface ProductImageActionState {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
}

function failure(error: unknown): ProductImageActionState {
  if (error instanceof z.ZodError)
    return {
      status: "error",
      message: error.issues[0]?.message ?? "Check the image details.",
    };
  if (error instanceof ProductImageVersionConflictError)
    return {
      status: "conflict",
      message: "This image changed in another session. Reload and try again.",
    };
  if (
    error instanceof ProductImageNotFoundError ||
    error instanceof ProductImageProductNotFoundError
  )
    return { status: "error", message: "Product image not found." };
  if (
    error instanceof ProductImageProductArchivedError ||
    error instanceof ProductImageLimitError ||
    error instanceof PermissionError ||
    error instanceof BillingAccessError
  )
    return { status: "error", message: error.message };
  return {
    status: "error",
    message: "The image change could not be completed. Try again.",
  };
}

function revalidateProduct(tenantSlug: string, productId: string) {
  revalidatePath(`/app/${tenantSlug}/products`);
  revalidatePath(`/app/${tenantSlug}/products/${productId}`);
}

export async function updateProductImageAltAction(
  tenantSlug: string,
  productId: string,
  imageId: string,
  _previous: ProductImageActionState,
  formData: FormData,
): Promise<ProductImageActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = altTextFormSchema.parse(Object.fromEntries(formData));
    await new ProductImageService().updateAltText(context, {
      productId,
      imageId,
      expectedVersion: input.expectedVersion,
      altText: input.altText,
    });
    revalidateProduct(context.tenantSlug, productId);
    return { status: "success", message: "Alternative text updated." };
  } catch (error) {
    return failure(error);
  }
}

export async function setPrimaryProductImageAction(
  tenantSlug: string,
  productId: string,
  imageId: string,
  _previous: ProductImageActionState,
  formData: FormData,
): Promise<ProductImageActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = versionFormSchema.parse(Object.fromEntries(formData));
    await new ProductImageService().setPrimary(context, {
      productId,
      imageId,
      expectedVersion: input.expectedVersion,
    });
    revalidateProduct(context.tenantSlug, productId);
    return { status: "success", message: "Primary image updated." };
  } catch (error) {
    return failure(error);
  }
}

export async function moveProductImageAction(
  tenantSlug: string,
  productId: string,
  imageId: string,
  _previous: ProductImageActionState,
  formData: FormData,
): Promise<ProductImageActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = moveFormSchema.parse(Object.fromEntries(formData));
    const result = await new ProductImageService().move(context, {
      productId,
      imageId,
      expectedVersion: input.expectedVersion,
      direction: input.direction,
    });
    revalidateProduct(context.tenantSlug, productId);
    return {
      status: "success",
      message: result.moved
        ? "Image order updated."
        : "Image is already at the edge.",
    };
  } catch (error) {
    return failure(error);
  }
}

export async function removeProductImageAction(
  tenantSlug: string,
  productId: string,
  imageId: string,
  _previous: ProductImageActionState,
  formData: FormData,
): Promise<ProductImageActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const input = versionFormSchema.parse(Object.fromEntries(formData));
    const service = new ProductImageService();
    const archived = await service.archive(context, {
      productId,
      imageId,
      expectedVersion: input.expectedVersion,
    });
    let cleanupCompleted = false;
    try {
      await deleteProductImage(archived.publicId);
      cleanupCompleted = true;
    } catch {
      // The archived metadata remains tenant-scoped for an operational retry.
    }
    try {
      await service.recordCleanupResult(context, {
        productId,
        imageId,
        archivedImageVersion: archived.archivedImageVersion,
        completed: cleanupCompleted,
      });
    } catch {
      // Removal remains successful; pending metadata is retained for recovery.
    }
    revalidateProduct(context.tenantSlug, productId);
    return {
      status: "success",
      message: cleanupCompleted
        ? "Image removed from the product and Cloudinary."
        : "Image removed from the product. Cloudinary cleanup needs retry.",
    };
  } catch (error) {
    return failure(error);
  }
}
