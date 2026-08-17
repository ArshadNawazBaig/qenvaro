"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  BillingAccessError,
  FeatureAccessError,
} from "@/modules/billing/entitlements";
import { PermissionError } from "@/modules/permissions/permissions";
import {
  archiveCustomRoleSchema,
  assignCustomRolesSchema,
  createCustomRoleSchema,
  updateCustomRoleSchema,
} from "@/modules/roles/schemas";
import {
  CustomRoleConflictError,
  CustomRoleDomainError,
  CustomRoleService,
} from "@/modules/roles/service";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export interface RoleActionState {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
}
export const roleInitialState: RoleActionState = {
  status: "idle",
  message: "",
};

function failure(error: unknown): RoleActionState {
  if (error instanceof CustomRoleConflictError)
    return { status: "conflict", message: error.message };
  if (
    error instanceof CustomRoleDomainError ||
    error instanceof BillingAccessError ||
    error instanceof FeatureAccessError ||
    error instanceof PermissionError
  )
    return { status: "error", message: error.message };
  if (error instanceof z.ZodError)
    return {
      status: "error",
      message: error.issues[0]?.message ?? "Review the custom role.",
    };
  if (
    typeof error === "object" &&
    error &&
    "code" in error &&
    error.code === 11000
  )
    return {
      status: "error",
      message: "An active custom role already uses that name.",
    };
  return {
    status: "error",
    message: "The custom role change could not be completed.",
  };
}

function roleFields(formData: FormData) {
  return {
    name: formData.get("name"),
    description: formData.get("description"),
    permissions: formData.getAll("permissions"),
  };
}
function refresh(slug: string) {
  revalidatePath(`/app/${slug}/settings/roles`);
  revalidatePath(`/app/${slug}/settings/members`);
}

export async function createCustomRoleAction(
  tenantSlug: string,
  _previous: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    await new CustomRoleService().create(
      context,
      createCustomRoleSchema.parse(roleFields(formData)),
    );
    refresh(context.tenantSlug);
    return { status: "success", message: "Custom role created." };
  } catch (error) {
    return failure(error);
  }
}

export async function updateCustomRoleAction(
  tenantSlug: string,
  roleId: string,
  _previous: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const result = await new CustomRoleService().update(
      context,
      updateCustomRoleSchema.parse({
        ...roleFields(formData),
        roleId,
        expectedVersion: Number(formData.get("expectedVersion")),
      }),
    );
    refresh(context.tenantSlug);
    return {
      status: "success",
      message: `Custom role updated to version ${result.version}.`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function archiveCustomRoleAction(
  tenantSlug: string,
  roleId: string,
  expectedVersion: number,
): Promise<RoleActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const result = await new CustomRoleService().archive(
      context,
      archiveCustomRoleSchema.parse({ roleId, expectedVersion }),
    );
    refresh(context.tenantSlug);
    return {
      status: "success",
      message: result.unchanged
        ? "Custom role is already archived."
        : "Custom role archived and assignments revoked.",
    };
  } catch (error) {
    return failure(error);
  }
}

export async function assignCustomRolesAction(
  tenantSlug: string,
  memberId: string,
  _previous: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  try {
    const context = await requireTenantContext(tenantSlug);
    const result = await new CustomRoleService().assign(
      context,
      assignCustomRolesSchema.parse({
        memberId,
        roleIds: formData.getAll("roleIds"),
      }),
    );
    refresh(context.tenantSlug);
    return {
      status: "success",
      message: `${result.roleCount} custom role${result.roleCount === 1 ? "" : "s"} assigned.`,
    };
  } catch (error) {
    return failure(error);
  }
}
