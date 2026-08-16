import "server-only";

import type { ClientSession, Db } from "mongodb";
import { planKeySchema, plans, assertUsageAvailable } from "@/config/plans";
import { createOpaqueId } from "@/lib/utils";
import { requireTenantWriteEntitlement } from "@/modules/billing/entitlements";
import type { AssignableMemberRole } from "@/modules/members/roles";
import { auth } from "@/server/auth/auth";
import { getDatabase, getMongoClient } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

type StringDocument = { _id: string } & Record<string, unknown>;

export interface MemberStoreOption {
  id: string;
  code: string;
  name: string;
}

export interface TenantMemberListItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string;
  storeIds: string[];
  isCurrentUser: boolean;
}

export interface TenantInvitationListItem {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  storeIds: string[];
}

export interface TenantMemberManagementData {
  members: TenantMemberListItem[];
  invitations: TenantInvitationListItem[];
  stores: MemberStoreOption[];
  memberLimit: number | null;
}

export class MemberManagementInvariantError extends Error {
  constructor(
    public readonly reason:
      | "invalid_stores"
      | "owner_protected"
      | "self_protected"
      | "target_not_found",
  ) {
    super("The requested member operation is not allowed.");
    this.name = "MemberManagementInvariantError";
  }
}

export async function getTenantMemberManagementData(
  context: TenantContext,
  requestHeaders: Headers,
): Promise<TenantMemberManagementData> {
  const database = await getDatabase();
  const [
    memberResult,
    invitations,
    stores,
    assignments,
    pendingAssignments,
    profile,
  ] = await Promise.all([
    auth.api.listMembers({
      headers: requestHeaders,
      query: { organizationId: context.tenantId, limit: 100, offset: 0 },
    }),
    auth.api.listInvitations({
      headers: requestHeaders,
      query: { organizationId: context.tenantId },
    }),
    database
      .collection<{ _id: string; code: string; name: string }>("stores")
      .find(
        {
          tenantId: context.tenantId,
          status: "active",
          deletedAt: { $exists: false },
        },
        { projection: { code: 1, name: 1 } },
      )
      .sort({ name: 1, _id: 1 })
      .toArray(),
    database
      .collection<{ membershipId: string; storeId: string }>(
        "memberStoreAssignments",
      )
      .find(
        { tenantId: context.tenantId },
        { projection: { membershipId: 1, storeId: 1 } },
      )
      .toArray(),
    database
      .collection<{ invitationId: string; storeId: string }>(
        "invitationStoreAssignments",
      )
      .find(
        { tenantId: context.tenantId },
        { projection: { invitationId: 1, storeId: 1 } },
      )
      .toArray(),
    database
      .collection<{ planKey: string }>("tenantProfiles")
      .findOne({ tenantId: context.tenantId }, { projection: { planKey: 1 } }),
  ]);
  if (!profile) throw new MemberManagementInvariantError("target_not_found");
  const memberStores = new Map<string, string[]>();
  for (const assignment of assignments) {
    const values = memberStores.get(assignment.membershipId) ?? [];
    values.push(assignment.storeId);
    memberStores.set(assignment.membershipId, values);
  }
  const invitationStores = new Map<string, string[]>();
  for (const assignment of pendingAssignments) {
    const values = invitationStores.get(assignment.invitationId) ?? [];
    values.push(assignment.storeId);
    invitationStores.set(assignment.invitationId, values);
  }
  const allStoreIds = stores.map((store) => String(store._id));
  return {
    members: memberResult.members.map((member) => ({
      id: member.id,
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      joinedAt: member.createdAt.toISOString(),
      storeIds:
        memberStores.get(member.id) ??
        (member.role
          .split(",")
          .some((role) => role === "owner" || role === "admin")
          ? allStoreIds
          : []),
      isCurrentUser: member.userId === context.userId,
    })),
    invitations: invitations
      .filter((invitation) => invitation.status === "pending")
      .map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
        storeIds: invitationStores.get(invitation.id) ?? [],
      })),
    stores: stores.map((store) => ({
      id: String(store._id),
      code: store.code,
      name: store.name,
    })),
    memberLimit: plans[planKeySchema.parse(profile.planKey)].limits.members,
  };
}

async function requireWriteAccess(
  database: Db,
  context: TenantContext,
): Promise<string> {
  const profile = await database
    .collection<{
      planKey: string;
      billingStatus?: string;
      trialEndsAt?: Date;
      graceEndsAt?: Date;
    }>("tenantProfiles")
    .findOne(
      { tenantId: context.tenantId },
      {
        projection: {
          planKey: 1,
          billingStatus: 1,
          trialEndsAt: 1,
          graceEndsAt: 1,
        },
      },
    );
  if (!profile) throw new MemberManagementInvariantError("target_not_found");
  return requireTenantWriteEntitlement(profile);
}

export async function validateTenantStoreIds(
  database: Db,
  context: TenantContext,
  storeIds: readonly string[],
): Promise<string[]> {
  const uniqueStoreIds = [...new Set(storeIds)];
  const count = await database
    .collection<{ _id: string; tenantId: string }>("stores")
    .countDocuments({
      tenantId: context.tenantId,
      _id: { $in: uniqueStoreIds },
      status: "active",
      deletedAt: { $exists: false },
    });
  if (uniqueStoreIds.length === 0 || count !== uniqueStoreIds.length)
    throw new MemberManagementInvariantError("invalid_stores");
  return uniqueStoreIds;
}

export async function assertMemberCapacity(context: TenantContext) {
  const database = await getDatabase();
  const planKey = planKeySchema.parse(
    await requireWriteAccess(database, context),
  );
  const [memberCount, pendingInvitationCount] = await Promise.all([
    database
      .collection("member")
      .countDocuments({ organizationId: context.tenantId }),
    database.collection("invitation").countDocuments({
      organizationId: context.tenantId,
      status: "pending",
      expiresAt: { $gt: new Date() },
    }),
  ]);
  assertUsageAvailable(
    planKey,
    "members",
    memberCount + pendingInvitationCount,
  );
}

async function writeAudit(
  database: Db,
  session: ClientSession,
  context: TenantContext,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
) {
  await database.collection<StringDocument>("auditLogs").insertOne(
    {
      _id: createOpaqueId("aud"),
      tenantId: context.tenantId,
      actorId: context.userId,
      action,
      entityType,
      entityId,
      requestId: context.requestId,
      summary,
      createdAt: new Date(),
    },
    { session },
  );
}

export async function saveInvitationStoreAssignments(
  context: TenantContext,
  invitationId: string,
  storeIds: readonly string[],
) {
  const client = await getMongoClient();
  const database = await getDatabase();
  const validStoreIds = await validateTenantStoreIds(
    database,
    context,
    storeIds,
  );
  await client.withSession(async (session) => {
    await session.withTransaction(async () => {
      const now = new Date();
      await database
        .collection<StringDocument>("invitationStoreAssignments")
        .deleteMany({ tenantId: context.tenantId, invitationId }, { session });
      await database
        .collection<StringDocument>("invitationStoreAssignments")
        .insertMany(
          validStoreIds.map((storeId) => ({
            _id: createOpaqueId("isa"),
            tenantId: context.tenantId,
            invitationId,
            storeId,
            createdAt: now,
            createdBy: context.userId,
          })),
          { session },
        );
      await writeAudit(
        database,
        session,
        context,
        "member.invited",
        "invitation",
        invitationId,
        "Invited a member with explicit store access.",
      );
    });
  });
}

export async function updateMemberAccess(
  context: TenantContext,
  memberId: string,
  role: AssignableMemberRole,
  storeIds: readonly string[],
  requestHeaders: Headers,
) {
  const database = await getDatabase();
  await requireWriteAccess(database, context);
  const target = await database
    .collection<{ _id: string; userId: string; role: string }>("member")
    .findOne(
      { _id: memberId, organizationId: context.tenantId },
      { projection: { userId: 1, role: 1 } },
    );
  if (!target) throw new MemberManagementInvariantError("target_not_found");
  if (target.role.split(",").includes("owner"))
    throw new MemberManagementInvariantError("owner_protected");
  const validStoreIds = await validateTenantStoreIds(
    database,
    context,
    storeIds,
  );
  await auth.api.updateMemberRole({
    headers: requestHeaders,
    body: { organizationId: context.tenantId, memberId, role },
  });
  const client = await getMongoClient();
  try {
    await client.withSession(async (session) => {
      await session.withTransaction(async () => {
        await database
          .collection("memberStoreAssignments")
          .deleteMany(
            { tenantId: context.tenantId, membershipId: memberId },
            { session },
          );
        await database
          .collection<StringDocument>("memberStoreAssignments")
          .insertMany(
            validStoreIds.map((storeId) => ({
              _id: createOpaqueId("msa"),
              tenantId: context.tenantId,
              membershipId: memberId,
              storeId,
              createdAt: new Date(),
              createdBy: context.userId,
            })),
            { session },
          );
        await writeAudit(
          database,
          session,
          context,
          "member.access.updated",
          "member",
          memberId,
          "Updated a member role and store access.",
        );
      });
    });
  } catch (error) {
    await auth.api.updateMemberRole({
      headers: requestHeaders,
      body: {
        organizationId: context.tenantId,
        memberId,
        role: target.role.split(","),
      },
    });
    throw error;
  }
}

export async function removeTenantMember(
  context: TenantContext,
  memberId: string,
  requestHeaders: Headers,
) {
  const database = await getDatabase();
  await requireWriteAccess(database, context);
  const target = await database
    .collection<{ _id: string; userId: string; role: string }>("member")
    .findOne(
      { _id: memberId, organizationId: context.tenantId },
      { projection: { userId: 1, role: 1 } },
    );
  if (!target) throw new MemberManagementInvariantError("target_not_found");
  if (target.userId === context.userId)
    throw new MemberManagementInvariantError("self_protected");
  if (target.role.split(",").includes("owner"))
    throw new MemberManagementInvariantError("owner_protected");
  await auth.api.removeMember({
    headers: requestHeaders,
    body: { organizationId: context.tenantId, memberIdOrEmail: memberId },
  });
  const client = await getMongoClient();
  await client.withSession(async (session) => {
    await session.withTransaction(async () => {
      await Promise.all([
        database
          .collection("memberStoreAssignments")
          .deleteMany(
            { tenantId: context.tenantId, membershipId: memberId },
            { session },
          ),
        database
          .collection("sessionStoreSelections")
          .deleteMany(
            { tenantId: context.tenantId, membershipId: memberId },
            { session },
          ),
      ]);
      await writeAudit(
        database,
        session,
        context,
        "member.removed",
        "member",
        memberId,
        "Removed a member from the tenant.",
      );
    });
  });
}

export async function cancelTenantInvitation(
  context: TenantContext,
  invitationId: string,
  requestHeaders: Headers,
) {
  const database = await getDatabase();
  await requireWriteAccess(database, context);
  const invitation = await database
    .collection<{ _id: string }>("invitation")
    .findOne(
      {
        _id: invitationId,
        organizationId: context.tenantId,
        status: "pending",
      },
      { projection: { _id: 1 } },
    );
  if (!invitation) throw new MemberManagementInvariantError("target_not_found");
  await auth.api.cancelInvitation({
    headers: requestHeaders,
    body: { invitationId },
  });
  const client = await getMongoClient();
  await client.withSession(async (session) => {
    await session.withTransaction(async () => {
      await database
        .collection("invitationStoreAssignments")
        .deleteMany({ tenantId: context.tenantId, invitationId }, { session });
      await writeAudit(
        database,
        session,
        context,
        "member.invitation.cancelled",
        "invitation",
        invitationId,
        "Cancelled a pending member invitation.",
      );
    });
  });
}

export async function materializeInvitationStoreAssignments(
  tenantId: string,
  invitationId: string,
  membershipId: string,
  actorId: string,
  requestId: string,
) {
  const client = await getMongoClient();
  const database = await getDatabase();
  await client.withSession(async (session) => {
    await session.withTransaction(async () => {
      const pending = await database
        .collection<{ storeId: string }>("invitationStoreAssignments")
        .find(
          { tenantId, invitationId },
          { session, projection: { storeId: 1 } },
        )
        .toArray();
      const storeIds = pending.map((assignment) => assignment.storeId);
      const activeStores = await database
        .collection<{ _id: string }>("stores")
        .find(
          {
            tenantId,
            _id: { $in: storeIds },
            status: "active",
            deletedAt: { $exists: false },
          },
          { session, projection: { _id: 1 } },
        )
        .toArray();
      if (activeStores.length > 0) {
        await database
          .collection<StringDocument>("memberStoreAssignments")
          .bulkWrite(
            activeStores.map((store) => ({
              updateOne: {
                filter: {
                  tenantId,
                  membershipId,
                  storeId: String(store._id),
                },
                update: {
                  $setOnInsert: {
                    _id: createOpaqueId("msa"),
                    tenantId,
                    membershipId,
                    storeId: String(store._id),
                    createdAt: new Date(),
                    createdBy: actorId,
                  },
                },
                upsert: true,
              },
            })),
            { session },
          );
      }
      await database
        .collection("invitationStoreAssignments")
        .deleteMany({ tenantId, invitationId }, { session });
      await database.collection<StringDocument>("auditLogs").insertOne(
        {
          _id: createOpaqueId("aud"),
          tenantId,
          actorId,
          action: "member.invitation.accepted",
          entityType: "member",
          entityId: membershipId,
          requestId,
          summary: "Accepted an invitation and activated assigned stores.",
          createdAt: new Date(),
        },
        { session },
      );
    });
  });
}
