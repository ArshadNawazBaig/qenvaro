"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  announcementSchema,
  banPlatformUserSchema,
  featureFlagSchema,
  reactivateTenantSchema,
  revokeSupportGrantSchema,
  supportGrantSchema,
  suspendTenantSchema,
  tenantFlagOverrideSchema,
  unbanPlatformUserSchema,
} from "@/modules/platform/schemas";
import {
  PlatformControlConflictError,
  PlatformControlDomainError,
  PlatformControlService,
} from "@/modules/platform/control-service";
import { requireVerifiedPlatformContext } from "@/server/auth/platform-context";

export interface PlatformActionState {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
}
export const platformInitialState: PlatformActionState = {
  status: "idle",
  message: "",
};
function failure(error: unknown): PlatformActionState {
  if (error instanceof PlatformControlConflictError)
    return { status: "conflict", message: error.message };
  if (error instanceof PlatformControlDomainError)
    return { status: "error", message: error.message };
  if (error instanceof z.ZodError)
    return {
      status: "error",
      message:
        error.issues[0]?.message ?? "Review the submitted platform control.",
    };
  if (
    typeof error === "object" &&
    error &&
    "code" in error &&
    error.code === 11000
  )
    return { status: "error", message: "That platform key already exists." };
  return {
    status: "error",
    message: "The platform operation could not be completed.",
  };
}
function refresh() {
  revalidatePath("/platform", "layout");
}

export async function suspendTenantAction(
  tenantId: string,
  expectedVersion: number,
  _previous: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  try {
    const context = await requireVerifiedPlatformContext();
    const result = await new PlatformControlService().suspendTenant(
      context,
      suspendTenantSchema.parse({
        tenantId,
        expectedVersion,
        reason: formData.get("reason"),
      }),
    );
    refresh();
    return {
      status: "success",
      message: result.unchanged
        ? "Tenant is already suspended."
        : "Tenant suspended.",
    };
  } catch (error) {
    return failure(error);
  }
}
export async function reactivateTenantAction(
  tenantId: string,
  expectedVersion: number,
  _previous: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  try {
    const context = await requireVerifiedPlatformContext();
    const result = await new PlatformControlService().reactivateTenant(
      context,
      reactivateTenantSchema.parse({
        tenantId,
        expectedVersion,
        reason: formData.get("reason"),
      }),
    );
    refresh();
    return {
      status: "success",
      message: result.unchanged
        ? "Tenant is already active."
        : "Tenant reactivated.",
    };
  } catch (error) {
    return failure(error);
  }
}
export async function grantSupportAccessAction(
  tenantId: string,
  _previous: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  try {
    const context = await requireVerifiedPlatformContext();
    const result = await new PlatformControlService().grantSupportAccess(
      context,
      supportGrantSchema.parse({
        tenantId,
        reason: formData.get("reason"),
        durationMinutes: Number(formData.get("durationMinutes")),
      }),
    );
    refresh();
    return {
      status: "success",
      message: `Support grant expires ${result.expiresAt.toISOString()}.`,
    };
  } catch (error) {
    return failure(error);
  }
}
export async function revokeSupportAccessAction(
  grantId: string,
  _previous: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  try {
    const context = await requireVerifiedPlatformContext();
    const result = await new PlatformControlService().revokeSupportAccess(
      context,
      revokeSupportGrantSchema.parse({
        grantId,
        reason: formData.get("reason"),
      }),
    );
    refresh();
    return {
      status: "success",
      message: result.unchanged
        ? "Support grant is already inactive."
        : "Support grant revoked.",
    };
  } catch (error) {
    return failure(error);
  }
}
export async function createFeatureFlagAction(
  _previous: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  try {
    const context = await requireVerifiedPlatformContext();
    await new PlatformControlService().createFeatureFlag(
      context,
      featureFlagSchema.parse({
        key: formData.get("key"),
        description: formData.get("description"),
        defaultEnabled: formData.get("defaultEnabled") === "on",
      }),
    );
    refresh();
    return { status: "success", message: "Feature flag created." };
  } catch (error) {
    return failure(error);
  }
}
export async function setTenantFlagOverrideAction(
  flagId: string,
  _previous: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  try {
    const context = await requireVerifiedPlatformContext();
    await new PlatformControlService().setTenantFlagOverride(
      context,
      tenantFlagOverrideSchema.parse({
        flagId,
        tenantId: formData.get("tenantId"),
        enabled: formData.get("enabled") === "true",
      }),
    );
    refresh();
    return { status: "success", message: "Tenant flag override updated." };
  } catch (error) {
    return failure(error);
  }
}
export async function publishAnnouncementAction(
  _previous: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  try {
    const context = await requireVerifiedPlatformContext();
    await new PlatformControlService().publishAnnouncement(
      context,
      announcementSchema.parse({
        title: formData.get("title"),
        message: formData.get("message"),
        severity: formData.get("severity"),
        href: formData.get("href"),
        durationDays: Number(formData.get("durationDays")),
      }),
    );
    refresh();
    return { status: "success", message: "Announcement published." };
  } catch (error) {
    return failure(error);
  }
}
export async function archiveAnnouncementAction(
  recordId: string,
): Promise<PlatformActionState> {
  try {
    const context = await requireVerifiedPlatformContext();
    await new PlatformControlService().archiveAnnouncement(context, recordId);
    refresh();
    return { status: "success", message: "Announcement archived." };
  } catch (error) {
    return failure(error);
  }
}

export async function banPlatformUserAction(
  userId: string,
  _previous: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  try {
    const context = await requireVerifiedPlatformContext();
    await new PlatformControlService().banUser(
      context,
      banPlatformUserSchema.parse({
        userId,
        reason: formData.get("reason"),
        durationDays: Number(formData.get("durationDays")),
      }),
    );
    refresh();
    return {
      status: "success",
      message: "User suspended and sessions revoked.",
    };
  } catch (error) {
    return failure(error);
  }
}

export async function unbanPlatformUserAction(
  userId: string,
  _previous: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  try {
    const context = await requireVerifiedPlatformContext();
    await new PlatformControlService().unbanUser(
      context,
      unbanPlatformUserSchema.parse({ userId, reason: formData.get("reason") }),
    );
    refresh();
    return { status: "success", message: "User reactivated." };
  } catch (error) {
    return failure(error);
  }
}
