import "server-only";

import type { ClientSession, Db } from "mongodb";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import {
  requireFeature,
  requireTenantWriteEntitlement,
} from "@/modules/billing/entitlements";
import {
  requirePermission,
  type Permission,
} from "@/modules/permissions/permissions";
import {
  archiveCustomRoleSchema,
  assignCustomRolesSchema,
  createCustomRoleSchema,
  updateCustomRoleSchema,
  type ArchiveCustomRoleInput,
  type AssignCustomRolesInput,
  type CreateCustomRoleInput,
  type UpdateCustomRoleInput,
} from "./schemas";
import { getMongoClient } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

type StringDocument = { _id: string } & Record<string, unknown>;

interface RoleDocument {
  _id: string;
  tenantId: string;
  name: string;
  normalizedName: string;
  description: string;
  permissions: Permission[];
  status: "active" | "archived";
  version: number;
  createdAt: Date;
  createdBy: string;
}

export class CustomRoleConflictError extends Error {
  constructor() {
    super("This role changed after the page was loaded.");
    this.name = "CustomRoleConflictError";
  }
}

export class CustomRoleDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomRoleDomainError";
  }
}

async function requireRoleFeature(
  database: Db,
  context: TenantContext,
  session: ClientSession,
) {
  const profile = await database
    .collection<{
      planKey: string;
      billingStatus?: string;
      trialEndsAt?: Date;
      graceEndsAt?: Date;
      currentPeriodEndsAt?: Date;
    }>("tenantProfiles")
    .findOne({ tenantId: context.tenantId }, { session });
  if (!profile)
    throw new CustomRoleDomainError("Business settings are unavailable.");
  const plan = requireTenantWriteEntitlement(profile);
  requireFeature(plan, "customRoles");
}

async function audit(
  database: Db,
  context: TenantContext,
  session: ClientSession,
  input: {
    action: string;
    entityType: string;
    entityId: string;
    summary: string;
    changes?: Record<string, unknown>;
  },
) {
  await database.collection<StringDocument>("auditLogs").insertOne(
    {
      _id: createOpaqueId("aud"),
      tenantId: context.tenantId,
      actorId: context.userId,
      requestId: context.requestId,
      ...input,
      createdAt: new Date(),
    },
    { session },
  );
}

function assertNoEscalation(
  context: TenantContext,
  permissions: readonly Permission[],
) {
  for (const permission of permissions)
    if (!context.permissions.has(permission))
      throw new CustomRoleDomainError(
        "A custom role cannot grant a capability you do not hold.",
      );
}

export class CustomRoleService {
  async create(context: TenantContext, untrusted: CreateCustomRoleInput) {
    requirePermission(context.permissions, "settings:manage");
    const input = createCustomRoleSchema.parse(untrusted);
    assertNoEscalation(context, input.permissions);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireRoleFeature(database, context, session);
        const count = await database
          .collection("customRoleDefinitions")
          .countDocuments(
            { tenantId: context.tenantId, status: "active" },
            { session },
          );
        if (count >= 25)
          throw new CustomRoleDomainError(
            "A business can have up to 25 active custom roles.",
          );
        const id = createOpaqueId("role");
        const now = new Date();
        await database
          .collection<RoleDocument>("customRoleDefinitions")
          .insertOne(
            {
              _id: id,
              tenantId: context.tenantId,
              name: input.name,
              normalizedName: input.name.toLocaleLowerCase("en-US"),
              description: input.description,
              permissions: input.permissions,
              status: "active",
              version: 1,
              createdAt: now,
              createdBy: context.userId,
            },
            { session },
          );
        await audit(database, context, session, {
          action: "custom_role.created",
          entityType: "customRole",
          entityId: id,
          summary: "Created a custom business role.",
          changes: { after: { permissionCount: input.permissions.length } },
        });
        return { id };
      }),
    );
    if (!result) throw new Error("Custom role creation did not complete.");
    return result;
  }

  async update(context: TenantContext, untrusted: UpdateCustomRoleInput) {
    requirePermission(context.permissions, "settings:manage");
    const input = updateCustomRoleSchema.parse(untrusted);
    assertNoEscalation(context, input.permissions);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireRoleFeature(database, context, session);
        const role = await database
          .collection<RoleDocument>("customRoleDefinitions")
          .findOne(
            { _id: input.roleId, tenantId: context.tenantId, status: "active" },
            { session },
          );
        if (!role)
          throw new CustomRoleDomainError("That custom role is unavailable.");
        if (role.version !== input.expectedVersion)
          throw new CustomRoleConflictError();
        const update = await database
          .collection<RoleDocument>("customRoleDefinitions")
          .updateOne(
            {
              _id: input.roleId,
              tenantId: context.tenantId,
              version: input.expectedVersion,
              status: "active",
            },
            {
              $set: {
                name: input.name,
                normalizedName: input.name.toLocaleLowerCase("en-US"),
                description: input.description,
                permissions: input.permissions,
                updatedAt: new Date(),
                updatedBy: context.userId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
        if (update.matchedCount !== 1) throw new CustomRoleConflictError();
        await audit(database, context, session, {
          action: "custom_role.updated",
          entityType: "customRole",
          entityId: input.roleId,
          summary: "Updated a custom business role.",
          changes: {
            before: { permissionCount: role.permissions.length },
            after: { permissionCount: input.permissions.length },
          },
        });
        return { version: input.expectedVersion + 1 };
      }),
    );
    if (!result) throw new Error("Custom role update did not complete.");
    return result;
  }

  async archive(context: TenantContext, untrusted: ArchiveCustomRoleInput) {
    requirePermission(context.permissions, "settings:manage");
    const input = archiveCustomRoleSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireRoleFeature(database, context, session);
        const role = await database
          .collection<RoleDocument>("customRoleDefinitions")
          .findOne(
            { _id: input.roleId, tenantId: context.tenantId },
            { session },
          );
        if (!role)
          throw new CustomRoleDomainError("That custom role is unavailable.");
        if (role.status === "archived") return { unchanged: true };
        if (role.version !== input.expectedVersion)
          throw new CustomRoleConflictError();
        const update = await database
          .collection<RoleDocument>("customRoleDefinitions")
          .updateOne(
            {
              _id: input.roleId,
              tenantId: context.tenantId,
              version: input.expectedVersion,
              status: "active",
            },
            {
              $set: {
                status: "archived",
                archivedAt: new Date(),
                archivedBy: context.userId,
                updatedAt: new Date(),
              },
              $inc: { version: 1 },
            },
            { session },
          );
        if (update.matchedCount !== 1) throw new CustomRoleConflictError();
        const assignments = await database
          .collection("memberCustomRoleAssignments")
          .deleteMany(
            { tenantId: context.tenantId, roleId: input.roleId },
            { session },
          );
        await audit(database, context, session, {
          action: "custom_role.archived",
          entityType: "customRole",
          entityId: input.roleId,
          summary:
            "Archived a custom business role and revoked its assignments.",
          changes: { after: { revokedAssignments: assignments.deletedCount } },
        });
        return { unchanged: false };
      }),
    );
    if (!result) throw new Error("Custom role archive did not complete.");
    return result;
  }

  async assign(context: TenantContext, untrusted: AssignCustomRolesInput) {
    requirePermission(context.permissions, "member:updateRole");
    const input = assignCustomRolesSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireRoleFeature(database, context, session);
        const member = await database
          .collection<{ _id: string; role: string }>("member")
          .findOne(
            { _id: input.memberId, organizationId: context.tenantId },
            { session, projection: { role: 1 } },
          );
        if (!member)
          throw new CustomRoleDomainError("That member is unavailable.");
        if (member.role.split(",").includes("owner"))
          throw new CustomRoleDomainError(
            "Owner access is managed separately.",
          );
        const roles =
          input.roleIds.length === 0
            ? []
            : await database
                .collection<RoleDocument>("customRoleDefinitions")
                .find(
                  {
                    _id: { $in: input.roleIds },
                    tenantId: context.tenantId,
                    status: "active",
                  },
                  { session },
                )
                .toArray();
        if (roles.length !== input.roleIds.length)
          throw new CustomRoleDomainError(
            "Choose active custom roles from this business.",
          );
        for (const role of roles) assertNoEscalation(context, role.permissions);
        await database
          .collection("memberCustomRoleAssignments")
          .deleteMany(
            { tenantId: context.tenantId, membershipId: input.memberId },
            { session },
          );
        if (roles.length > 0)
          await database
            .collection<StringDocument>("memberCustomRoleAssignments")
            .insertMany(
              roles.map((role) => ({
                _id: `${context.tenantId}:${input.memberId}:${role._id}`,
                tenantId: context.tenantId,
                membershipId: input.memberId,
                roleId: role._id,
                createdAt: new Date(),
                createdBy: context.userId,
              })),
              { session },
            );
        await audit(database, context, session, {
          action: "member.custom_roles_updated",
          entityType: "member",
          entityId: input.memberId,
          summary: "Updated custom role assignments for a tenant member.",
          changes: { after: { roleCount: roles.length } },
        });
        return { roleCount: roles.length };
      }),
    );
    if (!result) throw new Error("Custom role assignment did not complete.");
    return result;
  }
}
