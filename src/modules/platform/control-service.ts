import "server-only";

import type { ClientSession, Db } from "mongodb";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import {
  announcementSchema,
  archivePlatformRecordSchema,
  banPlatformUserSchema,
  featureFlagSchema,
  reactivateTenantSchema,
  revokeSupportGrantSchema,
  supportGrantSchema,
  suspendTenantSchema,
  tenantFlagOverrideSchema,
  unbanPlatformUserSchema,
  type AnnouncementInput,
  type BanPlatformUserInput,
  type FeatureFlagInput,
  type ReactivateTenantInput,
  type RevokeSupportGrantInput,
  type SupportGrantInput,
  type SuspendTenantInput,
  type TenantFlagOverrideInput,
  type UnbanPlatformUserInput,
} from "./schemas";
import { getMongoClient } from "@/server/db/client";
import type { VerifiedPlatformContext } from "@/server/auth/platform-context";

type StringDocument = { _id: string } & Record<string, unknown>;

export class PlatformControlConflictError extends Error {
  constructor() {
    super("This platform record changed after the page was loaded.");
    this.name = "PlatformControlConflictError";
  }
}
export class PlatformControlDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformControlDomainError";
  }
}

function assertVerified(context: VerifiedPlatformContext) {
  if (context.access !== "allow")
    throw new PlatformControlDomainError(
      "A verified platform session is required.",
    );
}
async function platformAudit(
  database: Db,
  context: VerifiedPlatformContext,
  session: ClientSession,
  input: {
    action: string;
    entityType: string;
    entityId: string;
    summary: string;
    reason?: string;
    changes?: Record<string, unknown>;
  },
) {
  await database.collection<StringDocument>("platformAuditLogs").insertOne(
    {
      _id: createOpaqueId("paud"),
      actorId: context.userId,
      requestId: context.requestId,
      ...input,
      createdAt: new Date(),
    },
    { session },
  );
}

export class PlatformControlService {
  async banUser(
    context: VerifiedPlatformContext,
    untrusted: BanPlatformUserInput,
  ) {
    assertVerified(context);
    const input = banPlatformUserSchema.parse(untrusted);
    if (input.userId === context.userId)
      throw new PlatformControlDomainError(
        "You cannot suspend your own platform account.",
      );
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    await client.withSession((session) =>
      session.withTransaction(async () => {
        const user = await database
          .collection<{ _id: string; role?: string; banned?: boolean }>("user")
          .findOne({ _id: input.userId }, { session });
        if (!user)
          throw new PlatformControlDomainError("That user is unavailable.");
        if ((user.role ?? "").split(",").includes("PLATFORM_SUPER_ADMIN"))
          throw new PlatformControlDomainError(
            "Platform super administrators require the trusted bootstrap revocation process.",
          );
        const expiresAt = new Date(
          Date.now() + input.durationDays * 86_400_000,
        );
        await database
          .collection<{ _id: string } & Record<string, unknown>>("user")
          .updateOne(
            { _id: input.userId },
            {
              $set: {
                banned: true,
                banReason: input.reason,
                banExpires: expiresAt,
                updatedAt: new Date(),
              },
            },
            { session },
          );
        await database
          .collection("session")
          .deleteMany({ userId: input.userId }, { session });
        await platformAudit(database, context, session, {
          action: "user.suspended",
          entityType: "user",
          entityId: input.userId,
          summary: "Suspended a platform identity and revoked its sessions.",
          reason: input.reason,
          changes: { after: { banned: true, expiresAt } },
        });
      }),
    );
  }

  async unbanUser(
    context: VerifiedPlatformContext,
    untrusted: UnbanPlatformUserInput,
  ) {
    assertVerified(context);
    const input = unbanPlatformUserSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    await client.withSession((session) =>
      session.withTransaction(async () => {
        const user = await database
          .collection<{ _id: string; role?: string; banned?: boolean }>("user")
          .findOne({ _id: input.userId }, { session });
        if (!user)
          throw new PlatformControlDomainError("That user is unavailable.");
        if (!user.banned)
          throw new PlatformControlDomainError("That user is not suspended.");
        await database
          .collection<{ _id: string } & Record<string, unknown>>("user")
          .updateOne(
            { _id: input.userId, banned: true },
            {
              $set: { banned: false, updatedAt: new Date() },
              $unset: { banReason: "", banExpires: "" },
            },
            { session },
          );
        await platformAudit(database, context, session, {
          action: "user.reactivated",
          entityType: "user",
          entityId: input.userId,
          summary: "Reactivated a suspended platform identity.",
          reason: input.reason,
          changes: { after: { banned: false } },
        });
      }),
    );
  }

  async suspendTenant(
    context: VerifiedPlatformContext,
    untrusted: SuspendTenantInput,
  ) {
    assertVerified(context);
    const input = suspendTenantSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        const profile = await database
          .collection<{
            _id: string;
            tenantId: string;
            billingStatus?: string;
            version?: number;
          }>("tenantProfiles")
          .findOne(
            { tenantId: input.tenantId },
            {
              session,
              projection: { tenantId: 1, billingStatus: 1, version: 1 },
            },
          );
        if (!profile)
          throw new PlatformControlDomainError("That tenant is unavailable.");
        const version = profile.version ?? 1;
        if (version !== input.expectedVersion)
          throw new PlatformControlConflictError();
        if (profile.billingStatus === "suspended")
          return { unchanged: true, version };
        const update = await database.collection("tenantProfiles").updateOne(
          {
            tenantId: input.tenantId,
            version: profile.version ?? { $exists: false },
            billingStatus: { $ne: "suspended" },
          },
          {
            $set: {
              billingStatus: "suspended",
              preSuspensionBillingStatus: profile.billingStatus ?? "trialing",
              suspendedAt: new Date(),
              suspendedBy: context.userId,
              suspensionReason: input.reason,
              updatedAt: new Date(),
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1) throw new PlatformControlConflictError();
        await platformAudit(database, context, session, {
          action: "tenant.suspended",
          entityType: "tenant",
          entityId: input.tenantId,
          summary:
            "Suspended tenant access; only security and billing recovery remain available.",
          reason: input.reason,
          changes: {
            before: { billingStatus: profile.billingStatus ?? "trialing" },
            after: { billingStatus: "suspended" },
          },
        });
        return { unchanged: false, version: version + 1 };
      }),
    );
    if (!result) throw new Error("Tenant suspension did not complete.");
    return result;
  }

  async reactivateTenant(
    context: VerifiedPlatformContext,
    untrusted: ReactivateTenantInput,
  ) {
    assertVerified(context);
    const input = reactivateTenantSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        const profile = await database
          .collection<{
            tenantId: string;
            billingStatus?: string;
            preSuspensionBillingStatus?: string;
            version?: number;
          }>("tenantProfiles")
          .findOne({ tenantId: input.tenantId }, { session });
        if (!profile)
          throw new PlatformControlDomainError("That tenant is unavailable.");
        const version = profile.version ?? 1;
        if (version !== input.expectedVersion)
          throw new PlatformControlConflictError();
        if (profile.billingStatus !== "suspended")
          return { unchanged: true, version };
        const restoredStatus = [
          "active",
          "trialing",
          "past_due",
          "canceled",
        ].includes(profile.preSuspensionBillingStatus ?? "")
          ? profile.preSuspensionBillingStatus
          : "past_due";
        const update = await database.collection("tenantProfiles").updateOne(
          {
            tenantId: input.tenantId,
            version: profile.version ?? { $exists: false },
            billingStatus: "suspended",
          },
          {
            $set: {
              billingStatus: restoredStatus,
              reactivatedAt: new Date(),
              reactivatedBy: context.userId,
              updatedAt: new Date(),
            },
            $unset: {
              suspendedAt: "",
              suspendedBy: "",
              suspensionReason: "",
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1) throw new PlatformControlConflictError();
        await platformAudit(database, context, session, {
          action: "tenant.reactivated",
          entityType: "tenant",
          entityId: input.tenantId,
          summary: "Reactivated tenant access to its preserved billing state.",
          reason: input.reason,
          changes: {
            before: { billingStatus: "suspended" },
            after: { billingStatus: restoredStatus },
          },
        });
        return { unchanged: false, version: version + 1 };
      }),
    );
    if (!result) throw new Error("Tenant reactivation did not complete.");
    return result;
  }

  async grantSupportAccess(
    context: VerifiedPlatformContext,
    untrusted: SupportGrantInput,
  ) {
    assertVerified(context);
    const input = supportGrantSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        const tenant = await database
          .collection("tenantProfiles")
          .findOne(
            { tenantId: input.tenantId },
            { session, projection: { _id: 1 } },
          );
        if (!tenant)
          throw new PlatformControlDomainError("That tenant is unavailable.");
        const active = await database
          .collection<StringDocument>("supportAccessGrants")
          .findOne(
            {
              tenantId: input.tenantId,
              status: "active",
              expiresAt: { $gt: new Date() },
            },
            { session, projection: { _id: 1 } },
          );
        if (active)
          throw new PlatformControlDomainError(
            "An active support grant already exists for this tenant.",
          );
        const id = createOpaqueId("support");
        const now = new Date();
        const expiresAt = new Date(
          now.getTime() + input.durationMinutes * 60_000,
        );
        await database
          .collection<StringDocument>("supportAccessGrants")
          .insertOne(
            {
              _id: id,
              tenantId: input.tenantId,
              status: "active",
              reason: input.reason,
              grantedBy: context.userId,
              grantedAt: now,
              expiresAt,
              createdAt: now,
            },
            { session },
          );
        await platformAudit(database, context, session, {
          action: "support_access.granted",
          entityType: "supportAccessGrant",
          entityId: id,
          summary: `Created a time-limited ${input.durationMinutes}-minute support grant.`,
          reason: input.reason,
          changes: { after: { tenantId: input.tenantId, expiresAt } },
        });
        return { id, expiresAt };
      }),
    );
    if (!result) throw new Error("Support access grant did not complete.");
    return result;
  }

  async revokeSupportAccess(
    context: VerifiedPlatformContext,
    untrusted: RevokeSupportGrantInput,
  ) {
    assertVerified(context);
    const input = revokeSupportGrantSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        const grant = await database
          .collection<{ _id: string; status: string; tenantId: string }>(
            "supportAccessGrants",
          )
          .findOne({ _id: input.grantId }, { session });
        if (!grant)
          throw new PlatformControlDomainError(
            "That support grant is unavailable.",
          );
        if (grant.status !== "active") return { unchanged: true };
        await database
          .collection<StringDocument>("supportAccessGrants")
          .updateOne(
            { _id: input.grantId, status: "active" },
            {
              $set: {
                status: "revoked",
                revokedAt: new Date(),
                revokedBy: context.userId,
                revocationReason: input.reason,
              },
            },
            { session },
          );
        await platformAudit(database, context, session, {
          action: "support_access.revoked",
          entityType: "supportAccessGrant",
          entityId: input.grantId,
          summary: "Revoked a tenant support access grant.",
          reason: input.reason,
          changes: { after: { tenantId: grant.tenantId, status: "revoked" } },
        });
        return { unchanged: false };
      }),
    );
    if (!result) throw new Error("Support access revocation did not complete.");
    return result;
  }

  async createFeatureFlag(
    context: VerifiedPlatformContext,
    untrusted: FeatureFlagInput,
  ) {
    assertVerified(context);
    const input = featureFlagSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const id = createOpaqueId("flag");
    const now = new Date();
    await client.withSession((session) =>
      session.withTransaction(async () => {
        await database
          .collection<StringDocument>("platformFeatureFlags")
          .insertOne(
            {
              _id: id,
              ...input,
              status: "active",
              version: 1,
              createdAt: now,
              createdBy: context.userId,
            },
            { session },
          );
        await platformAudit(database, context, session, {
          action: "feature_flag.created",
          entityType: "featureFlag",
          entityId: id,
          summary: "Created a platform feature flag.",
          changes: {
            after: { key: input.key, defaultEnabled: input.defaultEnabled },
          },
        });
      }),
    );
    return { id };
  }

  async setTenantFlagOverride(
    context: VerifiedPlatformContext,
    untrusted: TenantFlagOverrideInput,
  ) {
    assertVerified(context);
    const input = tenantFlagOverrideSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    await client.withSession((session) =>
      session.withTransaction(async () => {
        const flag = await database
          .collection<StringDocument>("platformFeatureFlags")
          .findOne(
            { _id: input.flagId, status: "active" },
            { session, projection: { _id: 1 } },
          );
        const tenant = await database
          .collection("tenantProfiles")
          .findOne(
            { tenantId: input.tenantId },
            { session, projection: { _id: 1 } },
          );
        if (!flag || !tenant)
          throw new PlatformControlDomainError(
            "Choose an active feature flag and tenant.",
          );
        await database
          .collection<StringDocument>("tenantFeatureFlagOverrides")
          .updateOne(
            { flagId: input.flagId, tenantId: input.tenantId },
            {
              $set: {
                enabled: input.enabled,
                updatedAt: new Date(),
                updatedBy: context.userId,
              },
              $setOnInsert: {
                _id: `${input.flagId}:${input.tenantId}`,
                flagId: input.flagId,
                tenantId: input.tenantId,
                createdAt: new Date(),
              },
            },
            { session, upsert: true },
          );
        await platformAudit(database, context, session, {
          action: "feature_flag.tenant_override_updated",
          entityType: "featureFlag",
          entityId: input.flagId,
          summary: "Updated a tenant-specific feature flag override.",
          changes: {
            after: { tenantId: input.tenantId, enabled: input.enabled },
          },
        });
      }),
    );
  }

  async publishAnnouncement(
    context: VerifiedPlatformContext,
    untrusted: AnnouncementInput,
  ) {
    assertVerified(context);
    const input = announcementSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const id = createOpaqueId("announce");
    const now = new Date();
    const endsAt = new Date(now.getTime() + input.durationDays * 86_400_000);
    await client.withSession((session) =>
      session.withTransaction(async () => {
        await database
          .collection<StringDocument>("platformAnnouncements")
          .insertOne(
            {
              _id: id,
              title: input.title,
              message: input.message,
              severity: input.severity,
              href: input.href,
              status: "published",
              startsAt: now,
              endsAt,
              createdAt: now,
              createdBy: context.userId,
            },
            { session },
          );
        await platformAudit(database, context, session, {
          action: "announcement.published",
          entityType: "announcement",
          entityId: id,
          summary: "Published a time-bounded platform announcement.",
          changes: { after: { severity: input.severity, endsAt } },
        });
      }),
    );
    return { id };
  }

  async archiveAnnouncement(
    context: VerifiedPlatformContext,
    recordId: string,
  ) {
    assertVerified(context);
    const { recordId: id } = archivePlatformRecordSchema.parse({ recordId });
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    await client.withSession((session) =>
      session.withTransaction(async () => {
        const result = await database
          .collection<StringDocument>("platformAnnouncements")
          .updateOne(
            { _id: id, status: "published" },
            {
              $set: {
                status: "archived",
                archivedAt: new Date(),
                archivedBy: context.userId,
              },
            },
            { session },
          );
        if (result.matchedCount === 0)
          throw new PlatformControlDomainError(
            "That active announcement is unavailable.",
          );
        await platformAudit(database, context, session, {
          action: "announcement.archived",
          entityType: "announcement",
          entityId: id,
          summary: "Archived a platform announcement.",
        });
      }),
    );
  }
}
