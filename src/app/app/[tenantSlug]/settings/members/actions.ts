"use server";

import { APIError } from "better-auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { BillingAccessError } from "@/modules/billing/entitlements";
import {
  assertMemberCapacity,
  cancelTenantInvitation,
  MemberManagementInvariantError,
  removeTenantMember,
  saveInvitationStoreAssignments,
  updateMemberAccess,
  validateTenantStoreIds,
} from "@/modules/members/member-service";
import {
  invitationTargetSchema,
  inviteMemberSchema,
  memberTargetSchema,
  updateMemberSchema,
} from "@/modules/members/schemas";
import { PlanLimitError } from "@/config/plans";
import { auth } from "@/server/auth/auth";
import { getDatabase } from "@/server/db/client";
import { logger } from "@/server/logging/logger";
import { requirePermission } from "@/modules/permissions/permissions";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export interface MemberActionState {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Record<string, string[]>;
}

function failure(error: unknown): MemberActionState {
  if (error instanceof PlanLimitError)
    return {
      status: "error",
      message: `This plan supports up to ${error.limit} members, including pending invitations.`,
    };
  if (error instanceof BillingAccessError)
    return {
      status: "error",
      message: "Member changes are unavailable while billing is read-only.",
    };
  if (error instanceof MemberManagementInvariantError) {
    const messages = {
      invalid_stores: "Choose active stores from this business.",
      owner_protected: "Owner access cannot be changed from team settings.",
      self_protected: "You cannot remove your own membership here.",
      target_not_found: "That member or invitation is no longer available.",
    } as const;
    return { status: "error", message: messages[error.reason] };
  }
  if (error instanceof APIError)
    return {
      status: "error",
      message:
        error.status === "TOO_MANY_REQUESTS"
          ? "Too many requests. Wait a moment and try again."
          : "Better Auth could not complete that team change.",
    };
  logger.warn({
    event: "tenant.member_action.failed",
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  return {
    status: "error",
    message: "We could not save that team change. Try again.",
  };
}

function parsedFormData(formData: FormData) {
  return {
    ...Object.fromEntries(formData),
    storeIds: formData.getAll("storeIds"),
  };
}

export async function inviteMemberAction(
  tenantSlug: string,
  _previous: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const parsed = inviteMemberSchema.safeParse(parsedFormData(formData));
  if (!parsed.success)
    return {
      status: "error",
      message: "Review the invitation details.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  let invitationId: string | undefined;
  let requestHeaders: Headers | undefined;
  try {
    const context = await requireTenantContext(tenantSlug);
    requirePermission(context.permissions, "member:invite");
    const database = await getDatabase();
    await validateTenantStoreIds(database, context, parsed.data.storeIds);
    await assertMemberCapacity(context);
    requestHeaders = await headers();
    const invitation = await auth.api.createInvitation({
      headers: requestHeaders,
      body: {
        organizationId: context.tenantId,
        email: parsed.data.email,
        role: parsed.data.role,
      },
    });
    invitationId = invitation.id;
    await saveInvitationStoreAssignments(
      context,
      invitation.id,
      parsed.data.storeIds,
    );
    revalidatePath(`/app/${context.tenantSlug}/settings/members`);
    return {
      status: "success",
      message: `Invitation sent to ${parsed.data.email}.`,
    };
  } catch (error) {
    if (invitationId && requestHeaders) {
      try {
        await auth.api.cancelInvitation({
          headers: requestHeaders,
          body: { invitationId },
        });
      } catch {
        logger.error({
          event: "tenant.member_invitation.compensation_failed",
          invitationId,
        });
      }
    }
    return failure(error);
  }
}

export async function updateMemberAction(
  tenantSlug: string,
  _previous: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const parsed = updateMemberSchema.safeParse(parsedFormData(formData));
  if (!parsed.success)
    return {
      status: "error",
      message: "Choose a valid role and at least one store.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  try {
    const context = await requireTenantContext(tenantSlug);
    requirePermission(context.permissions, "member:updateRole");
    const requestHeaders = await headers();
    await updateMemberAccess(
      context,
      parsed.data.memberId,
      parsed.data.role,
      parsed.data.storeIds,
      requestHeaders,
    );
    revalidatePath(`/app/${context.tenantSlug}/settings/members`);
    return { status: "success", message: "Member access updated." };
  } catch (error) {
    return failure(error);
  }
}

export async function removeMemberAction(
  tenantSlug: string,
  memberId: string,
): Promise<MemberActionState> {
  const parsed = memberTargetSchema.safeParse({ memberId });
  if (!parsed.success)
    return { status: "error", message: "That member is not available." };
  try {
    const context = await requireTenantContext(tenantSlug);
    requirePermission(context.permissions, "member:remove");
    await removeTenantMember(context, parsed.data.memberId, await headers());
    revalidatePath(`/app/${context.tenantSlug}/settings/members`);
    return { status: "success", message: "Member removed." };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelInvitationAction(
  tenantSlug: string,
  invitationId: string,
): Promise<MemberActionState> {
  const parsed = invitationTargetSchema.safeParse({ invitationId });
  if (!parsed.success)
    return { status: "error", message: "That invitation is not available." };
  try {
    const context = await requireTenantContext(tenantSlug);
    requirePermission(context.permissions, "member:invite");
    await cancelTenantInvitation(
      context,
      parsed.data.invitationId,
      await headers(),
    );
    revalidatePath(`/app/${context.tenantSlug}/settings/members`);
    return { status: "success", message: "Invitation cancelled." };
  } catch (error) {
    return failure(error);
  }
}
