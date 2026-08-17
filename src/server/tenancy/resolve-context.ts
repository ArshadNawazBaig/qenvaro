import "server-only";
import { headers } from "next/headers";
import {
  resolvePermissions,
  type Permission,
  type TenantRole,
} from "@/modules/permissions/permissions";
import { planKeySchema, plans } from "@/config/plans";
import { customizablePermissions } from "@/modules/roles/schemas";
import { auth } from "@/server/auth/auth";
import { getDatabase } from "@/server/db/client";
import {
  TenantNotFoundError,
  TenantSuspendedError,
  type TenantContext,
} from "./context";

const roleMap: Record<string, TenantRole> = {
  owner: "OWNER",
  admin: "ADMIN",
  manager: "MANAGER",
  cashier: "CASHIER",
  inventory_manager: "INVENTORY_MANAGER",
  hr_manager: "HR_MANAGER",
  accountant: "ACCOUNTANT",
  employee: "EMPLOYEE",
  viewer: "VIEWER",
};

export async function requireTenantContext(
  tenantSlug: string,
  options: { allowSuspended?: boolean } = {},
): Promise<TenantContext> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) throw new TenantNotFoundError();
  const database = await getDatabase();
  const profile = await database
    .collection<{
      tenantId: string;
      slug: string;
      planKey: string;
      billingStatus?: string;
    }>("tenantProfiles")
    .findOne(
      { slug: tenantSlug },
      { projection: { tenantId: 1, slug: 1, planKey: 1, billingStatus: 1 } },
    );
  if (!profile) throw new TenantNotFoundError();
  if (profile.billingStatus === "suspended" && !options.allowSuspended)
    throw new TenantSuspendedError();
  const membership = await database
    .collection<{
      _id: string;
      organizationId: string;
      userId: string;
      role: string;
    }>("member")
    .findOne(
      { organizationId: profile.tenantId, userId: session.user.id },
      { projection: { role: 1 } },
    );
  if (!membership) throw new TenantNotFoundError();
  const roles = membership.role
    .split(",")
    .map((role) => roleMap[role])
    .filter((role): role is TenantRole => Boolean(role));
  if (roles.length === 0) throw new TenantNotFoundError();
  let customPermissions: Permission[] = [];
  if (plans[planKeySchema.parse(profile.planKey)].features.has("customRoles")) {
    const assignments = await database
      .collection<{ roleId: string }>("memberCustomRoleAssignments")
      .find(
        { tenantId: profile.tenantId, membershipId: String(membership._id) },
        { projection: { roleId: 1 } },
      )
      .limit(10)
      .toArray();
    const definitions = assignments.length
      ? await database
          .collection<{ _id: string; permissions: string[] }>(
            "customRoleDefinitions",
          )
          .find(
            {
              tenantId: profile.tenantId,
              _id: { $in: assignments.map((assignment) => assignment.roleId) },
              status: "active",
            },
            { projection: { permissions: 1 } },
          )
          .limit(10)
          .toArray()
      : [];
    const allowed = new Set<string>(customizablePermissions);
    customPermissions = definitions.flatMap((definition) =>
      definition.permissions.filter((permission): permission is Permission =>
        allowed.has(permission),
      ),
    );
  }
  const assignments = await database
    .collection<{ storeId: string }>("memberStoreAssignments")
    .find(
      { tenantId: profile.tenantId, membershipId: String(membership._id) },
      { projection: { storeId: 1 } },
    )
    .toArray();
  let allowedStoreIds: string[];
  if (
    assignments.length === 0 &&
    roles.some((role) => role === "OWNER" || role === "ADMIN")
  ) {
    allowedStoreIds = (
      await database
        .collection<{ _id: string }>("stores")
        .find(
          {
            tenantId: profile.tenantId,
            status: "active",
            deletedAt: { $exists: false },
          },
          { projection: { _id: 1 } },
        )
        .sort({ createdAt: 1, _id: 1 })
        .toArray()
    ).map((store) => String(store._id));
  } else {
    const assignedIds = assignments.map((assignment) => assignment.storeId);
    allowedStoreIds = (
      await database
        .collection<{ _id: string }>("stores")
        .find(
          {
            tenantId: profile.tenantId,
            _id: { $in: assignedIds },
            status: "active",
            deletedAt: { $exists: false },
          },
          { projection: { _id: 1 } },
        )
        .sort({ createdAt: 1, _id: 1 })
        .toArray()
    ).map((store) => String(store._id));
  }
  const selectedStore = await database
    .collection<{ storeId: string }>("sessionStoreSelections")
    .findOne(
      { sessionId: session.session.id, tenantId: profile.tenantId },
      { projection: { storeId: 1 } },
    );
  const activeStoreId =
    selectedStore && allowedStoreIds.includes(selectedStore.storeId)
      ? selectedStore.storeId
      : (allowedStoreIds[0] ?? null);
  return {
    tenantId: profile.tenantId,
    tenantSlug: profile.slug,
    userId: session.user.id,
    sessionId: session.session.id,
    membershipId: String(membership._id),
    roles,
    permissions: resolvePermissions(roles, customPermissions),
    allowedStoreIds: new Set(allowedStoreIds),
    activeStoreId,
    requestId: requestHeaders.get("x-request-id") ?? crypto.randomUUID(),
  };
}
