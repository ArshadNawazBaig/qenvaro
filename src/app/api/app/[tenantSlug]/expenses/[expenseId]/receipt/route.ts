import type { NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import { BillingAccessError } from "@/modules/billing/entitlements";
import { PermissionError } from "@/modules/permissions/permissions";
import {
  ExpenseService,
  PurchasingConflictError,
  PurchasingDomainError,
  PurchasingNotFoundError,
} from "@/modules/purchasing/service";
import { logger } from "@/server/logging/logger";
import {
  CloudinaryNotConfiguredError,
  deleteProductImage,
  isCloudinaryConfigured,
  uploadExpenseReceipt,
} from "@/server/media/cloudinary";
import { TenantNotFoundError } from "@/server/tenancy/context";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const runtime = "nodejs";

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const acceptedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

function trustedOrigin(request: NextRequest) {
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

function domainError(error: unknown) {
  if (
    error instanceof PurchasingNotFoundError ||
    error instanceof TenantNotFoundError
  )
    return jsonError("Expense not found or unavailable.", 404);
  if (error instanceof PermissionError) return jsonError(error.message, 403);
  if (
    error instanceof PurchasingConflictError ||
    error instanceof PurchasingDomainError ||
    error instanceof BillingAccessError
  )
    return jsonError(error.message, 409);
  if (error instanceof CloudinaryNotConfiguredError)
    return jsonError(error.message, 503);
  if (error instanceof z.ZodError)
    return jsonError(
      error.issues[0]?.message ?? "Invalid receipt metadata.",
      400,
    );
  return jsonError("The receipt image could not be uploaded. Try again.", 502);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; expenseId: string }> },
) {
  if (!trustedOrigin(request)) return jsonError("Invalid request origin.", 403);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_RECEIPT_BYTES + 1_048_576
  )
    return jsonError("Choose an image smaller than 10 MB.", 413);
  const { tenantSlug, expenseId } = await params;
  let context: Awaited<ReturnType<typeof requireTenantContext>>;
  try {
    context = await requireTenantContext(tenantSlug);
  } catch (error) {
    return domainError(error);
  }
  if (!isCloudinaryConfigured())
    return jsonError("Cloudinary image storage is not configured.", 503);
  const service = new ExpenseService();
  try {
    await service.assertReceiptUploadAllowed(context, expenseId);
    const formData = await request.formData();
    const receipt = formData.get("receipt");
    const expectedVersion = z.coerce
      .number()
      .int()
      .min(1)
      .parse(formData.get("expectedVersion"));
    if (!(receipt instanceof File) || receipt.size === 0)
      return jsonError("Choose a receipt image to upload.", 400);
    if (receipt.size > MAX_RECEIPT_BYTES)
      return jsonError("Choose an image smaller than 10 MB.", 413);
    if (!acceptedMimeTypes.has(receipt.type))
      return jsonError("Use a JPEG, PNG, WebP, or AVIF image.", 415);
    const receiptId = createOpaqueId("erc");
    const upload = await uploadExpenseReceipt({
      bytes: Buffer.from(await receipt.arrayBuffer()),
      tenantId: context.tenantId,
      expenseId,
      receiptId,
    });
    try {
      await service.attachReceipt(context, {
        expenseId,
        expectedVersion,
        upload,
      });
    } catch (error) {
      await deleteProductImage(upload.publicId).catch(
        (cleanupError: unknown) => {
          logger.error({
            event: "expense_receipt_cleanup_failed",
            tenantId: context.tenantId,
            expenseId,
            err: cleanupError,
          });
        },
      );
      throw error;
    }
    return Response.json({ ok: true, message: "Receipt image attached." });
  } catch (error) {
    logger.warn({
      event: "expense_receipt_upload_failed",
      tenantId: context.tenantId,
      expenseId,
      err: error,
    });
    return domainError(error);
  }
}
