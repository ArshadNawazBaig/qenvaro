import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import { BillingAccessError } from "@/modules/billing/entitlements";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_MIME_TYPES,
  productImageAltTextSchema,
} from "@/modules/product-images/schemas";
import {
  ProductImageLimitError,
  ProductImageProductArchivedError,
  ProductImageProductNotFoundError,
  ProductImageService,
} from "@/modules/product-images/service";
import { PermissionError } from "@/modules/permissions/permissions";
import { logger } from "@/server/logging/logger";
import {
  CloudinaryNotConfiguredError,
  deleteProductImage,
  isCloudinaryConfigured,
  uploadProductImage,
} from "@/server/media/cloudinary";
import { requireTenantContext } from "@/server/tenancy/resolve-context";
import { TenantNotFoundError } from "@/server/tenancy/context";

export const runtime = "nodejs";

const MAX_MULTIPART_BYTES = MAX_PRODUCT_IMAGE_BYTES + 1024 * 1024;
const acceptedMimeTypes = new Set<string>(PRODUCT_IMAGE_MIME_TYPES);

function trustedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return new Set([
    request.nextUrl.origin,
    new URL(env.NEXT_PUBLIC_APP_URL).origin,
  ]).has(origin);
}

function jsonError(message: string, status: number) {
  return Response.json({ ok: false, message }, { status });
}

function domainError(error: unknown): Response {
  if (error instanceof ProductImageLimitError)
    return jsonError(error.message, 409);
  if (
    error instanceof ProductImageProductArchivedError ||
    error instanceof BillingAccessError
  )
    return jsonError(error.message, 409);
  if (error instanceof ProductImageProductNotFoundError)
    return jsonError("Product not found or unavailable.", 404);
  if (error instanceof TenantNotFoundError)
    return jsonError("Product not found or unavailable.", 404);
  if (error instanceof PermissionError) return jsonError(error.message, 403);
  if (error instanceof CloudinaryNotConfiguredError)
    return jsonError(error.message, 503);
  if (error instanceof z.ZodError)
    return jsonError(
      error.issues[0]?.message ?? "Invalid image metadata.",
      400,
    );
  return jsonError("The image could not be uploaded. Try again.", 502);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; productId: string }> },
) {
  if (!trustedOrigin(request)) return jsonError("Invalid request origin.", 403);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES)
    return jsonError("Choose an image smaller than 10 MB.", 413);

  const { tenantSlug, productId } = await params;
  let context: Awaited<ReturnType<typeof requireTenantContext>>;
  try {
    context = await requireTenantContext(tenantSlug);
  } catch (error) {
    return domainError(error);
  }
  if (!isCloudinaryConfigured())
    return jsonError("Cloudinary image storage is not configured.", 503);

  const service = new ProductImageService();
  try {
    await service.assertUploadAllowed(context, productId);
    const formData = await request.formData();
    const image = formData.get("image");
    const altText = productImageAltTextSchema.parse(formData.get("altText"));
    if (!(image instanceof File) || image.size === 0)
      return jsonError("Choose an image to upload.", 400);
    if (image.size > MAX_PRODUCT_IMAGE_BYTES)
      return jsonError("Choose an image smaller than 10 MB.", 413);
    if (!acceptedMimeTypes.has(image.type))
      return jsonError("Use a JPEG, PNG, WebP, or AVIF image.", 415);

    const imageId = createOpaqueId("img");
    const upload = await uploadProductImage({
      bytes: Buffer.from(await image.arrayBuffer()),
      tenantId: context.tenantId,
      productId,
      imageId,
    });
    try {
      await service.attach(context, { productId, imageId, altText, upload });
    } catch (error) {
      try {
        await deleteProductImage(upload.publicId);
      } catch (cleanupError) {
        try {
          await service.recordOrphanCleanup(context, {
            productId,
            imageId,
            publicId: upload.publicId,
          });
        } catch (recordError) {
          logger.error({
            event: "product_image_orphan_cleanup_record_failed",
            tenantId: context.tenantId,
            productId,
            imageId,
            err: recordError,
            cleanupErr: cleanupError,
          });
        }
      }
      throw error;
    }
    revalidatePath(`/app/${context.tenantSlug}/products`);
    revalidatePath(`/app/${context.tenantSlug}/products/${productId}`);
    return Response.json({ ok: true, message: "Product image uploaded." });
  } catch (error) {
    logger.warn({
      event: "product_image_upload_failed",
      tenantId: context.tenantId,
      productId,
      err: error,
    });
    return domainError(error);
  }
}
