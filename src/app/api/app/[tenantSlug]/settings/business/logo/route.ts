import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import { BillingAccessError } from "@/modules/billing/entitlements";
import {
  PermissionError,
  requirePermission,
} from "@/modules/permissions/permissions";
import {
  BUSINESS_LOGO_MIME_TYPES,
  MAX_BUSINESS_LOGO_BYTES,
} from "@/modules/settings/schemas";
import {
  SettingsConflictError,
  SettingsDomainError,
  TenantSettingsService,
} from "@/modules/settings/service";
import { logger } from "@/server/logging/logger";
import {
  CloudinaryNotConfiguredError,
  deleteCloudinaryImage,
  isCloudinaryConfigured,
  uploadBusinessLogo,
} from "@/server/media/cloudinary";
import { TenantNotFoundError } from "@/server/tenancy/context";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const runtime = "nodejs";

const MAX_MULTIPART_BYTES = MAX_BUSINESS_LOGO_BYTES + 512 * 1024;
const acceptedMimeTypes = new Set<string>(BUSINESS_LOGO_MIME_TYPES);
const versionSchema = z.coerce.number().int().min(1);

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
  if (error instanceof SettingsConflictError)
    return jsonError(error.message, 409);
  if (
    error instanceof SettingsDomainError ||
    error instanceof BillingAccessError
  )
    return jsonError(error.message, 409);
  if (error instanceof PermissionError) return jsonError(error.message, 403);
  if (error instanceof TenantNotFoundError)
    return jsonError("Business settings are unavailable.", 404);
  if (error instanceof CloudinaryNotConfiguredError)
    return jsonError(error.message, 503);
  if (error instanceof z.ZodError)
    return jsonError(
      error.issues[0]?.message ?? "Check the business logo details.",
      400,
    );
  return jsonError("The business logo could not be updated.", 502);
}

function refresh(tenantSlug: string) {
  revalidatePath(`/app/${tenantSlug}`, "layout");
  revalidatePath(`/app/${tenantSlug}/settings/business`);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  if (!trustedOrigin(request)) return jsonError("Invalid request origin.", 403);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES)
    return jsonError("Choose a logo smaller than 2 MB.", 413);

  const { tenantSlug } = await params;
  let context: Awaited<ReturnType<typeof requireTenantContext>>;
  try {
    context = await requireTenantContext(tenantSlug);
    requirePermission(context.permissions, "settings:manage");
  } catch (error) {
    return domainError(error);
  }
  if (!isCloudinaryConfigured())
    return jsonError("Cloudinary image storage is not configured.", 503);

  let uploadedPublicId: string | null = null;
  try {
    const formData = await request.formData();
    const image = formData.get("logo");
    const expectedVersion = versionSchema.parse(
      formData.get("expectedVersion"),
    );
    if (!(image instanceof File) || image.size === 0)
      return jsonError("Choose a business logo to upload.", 400);
    if (image.size > MAX_BUSINESS_LOGO_BYTES)
      return jsonError("Choose a logo smaller than 2 MB.", 413);
    if (!acceptedMimeTypes.has(image.type))
      return jsonError("Use a JPEG, PNG, WebP, or AVIF image.", 415);

    const upload = await uploadBusinessLogo({
      bytes: Buffer.from(await image.arrayBuffer()),
      tenantId: context.tenantId,
      logoId: createOpaqueId("logo"),
    });
    uploadedPublicId = upload.publicId;
    const result = await new TenantSettingsService().replaceBusinessLogo(
      context,
      { expectedVersion, logo: upload },
    );
    if (result.previousPublicId && result.previousPublicId !== upload.publicId)
      await deleteCloudinaryImage(result.previousPublicId).catch((error) => {
        logger.warn({
          event: "business_logo_previous_asset_cleanup_failed",
          tenantId: context.tenantId,
          publicId: result.previousPublicId,
          err: error,
        });
      });
    uploadedPublicId = null;
    refresh(context.tenantSlug);
    return Response.json({
      ok: true,
      message: "Business logo updated.",
      version: result.version,
      logoUrl: upload.secureUrl,
    });
  } catch (error) {
    if (uploadedPublicId)
      await deleteCloudinaryImage(uploadedPublicId).catch((cleanupError) => {
        logger.error({
          event: "business_logo_upload_cleanup_failed",
          tenantId: context.tenantId,
          publicId: uploadedPublicId,
          err: cleanupError,
        });
      });
    logger.warn({
      event: "business_logo_upload_failed",
      tenantId: context.tenantId,
      err: error,
    });
    return domainError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  if (!trustedOrigin(request)) return jsonError("Invalid request origin.", 403);
  const { tenantSlug } = await params;
  try {
    const context = await requireTenantContext(tenantSlug);
    const body = (await request.json().catch(() => ({}))) as {
      expectedVersion?: unknown;
    };
    const expectedVersion = versionSchema.parse(body.expectedVersion);
    const result = await new TenantSettingsService().removeBusinessLogo(
      context,
      { expectedVersion },
    );
    if (result.previousPublicId)
      await deleteCloudinaryImage(result.previousPublicId).catch((error) => {
        logger.warn({
          event: "business_logo_asset_cleanup_failed",
          tenantId: context.tenantId,
          publicId: result.previousPublicId,
          err: error,
        });
      });
    refresh(context.tenantSlug);
    return Response.json({
      ok: true,
      message: "Business logo removed. Qenvaro branding is now in use.",
      version: result.version,
    });
  } catch (error) {
    logger.warn({
      event: "business_logo_remove_failed",
      tenantSlug,
      err: error,
    });
    return domainError(error);
  }
}
