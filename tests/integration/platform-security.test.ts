import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrapConfiguredSuperAdmins } from "../../scripts/platform/bootstrap-service";
import { betterAuthPlatformRoles } from "@/server/auth/access";
import type { VerifiedPlatformContext } from "@/server/auth/platform-context";
import { getPlatformOverview } from "@/server/repositories/platform-overview";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)("platform security boundary", () => {
  const suffix = crypto.randomUUID();
  const verifiedUserId = `usr_platform_verified_${suffix}`;
  const unverifiedUserId = `usr_platform_unverified_${suffix}`;
  const verifiedEmail = `platform-${suffix}@example.test`;
  const unverifiedEmail = `platform-unverified-${suffix}@example.test`;
  const tenantId = `org_platform_${suffix}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringDocument>("user").insertMany([
      {
        _id: verifiedUserId,
        name: "Platform Verified",
        email: verifiedEmail,
        emailVerified: true,
        role: "user",
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: unverifiedUserId,
        name: "Platform Unverified",
        email: unverifiedEmail,
        emailVerified: false,
        role: "user",
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `usr_platform_metric_${suffix}`,
        name: "Metric User",
        email: `metric-${suffix}@example.test`,
        emailVerified: true,
        role: "user",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.collection<StringDocument>("session").insertOne({
      _id: `session_platform_${suffix}`,
      userId: verifiedUserId,
      token: `token_platform_${suffix}`,
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
    });
    await database.collection<StringDocument>("tenantProfiles").insertMany([
      {
        _id: `tenant_platform_active_${suffix}`,
        tenantId,
        slug: `platform-active-${suffix}`,
        businessName: `DO_NOT_EXPOSE_BUSINESS_${suffix}`,
        planKey: `platform_plan_${suffix}`,
        billingStatus: `platform_status_${suffix}`,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `tenant_platform_trial_${suffix}`,
        tenantId: `${tenantId}_trial`,
        slug: `platform-trial-${suffix}`,
        businessName: `DO_NOT_EXPOSE_TRIAL_${suffix}`,
        planKey: "starter",
        billingStatus: "trialing",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.collection<StringDocument>("subscription").insertMany([
      {
        _id: `subscription_platform_${suffix}`,
        referenceId: tenantId,
        plan: "growth",
        status: `platform_subscription_${suffix}`,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `subscription_platform_past_due_${suffix}`,
        referenceId: `${tenantId}_trial`,
        plan: "starter",
        status: "past_due",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.collection<StringDocument>("webhookEvents").insertMany([
      {
        _id: `webhook_platform_verified_${suffix}`,
        provider: "stripe",
        eventId: `evt_platform_verified_${suffix}`,
        type: `platform.event.${suffix}`,
        processingStatus: "processed",
        verifiedAt: now,
        occurredAt: now,
        lastAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `webhook_platform_unverified_${suffix}`,
        provider: "stripe",
        eventId: `evt_platform_unverified_${suffix}`,
        type: `unverified.secret.${suffix}`,
        processingStatus: "processed",
        occurredAt: now,
        lastAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.collection<StringDocument>("products").insertOne({
      _id: `product_platform_${suffix}`,
      tenantId,
      name: `DO_NOT_EXPOSE_PRODUCT_${suffix}`,
      normalizedSku: `platform-${suffix}`,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterAll(async () => {
    await database.collection("platformAuditLogs").deleteMany({
      entityId: { $in: [verifiedUserId, unverifiedUserId] },
    });
    await database.collection("session").deleteMany({
      userId: { $in: [verifiedUserId, unverifiedUserId] },
    });
    await database.collection("webhookEvents").deleteMany({
      eventId: { $regex: suffix },
    });
    await database.collection("subscription").deleteMany({
      referenceId: { $in: [tenantId, `${tenantId}_trial`] },
    });
    await database.collection("products").deleteMany({ tenantId });
    await database.collection("tenantProfiles").deleteMany({
      tenantId: { $in: [tenantId, `${tenantId}_trial`] },
    });
    await database.collection<StringDocument>("user").deleteMany({
      _id: { $regex: suffix },
    });
    await client.close();
  });

  it("promotes only configured verified accounts and revokes old sessions", async () => {
    const first = await bootstrapConfiguredSuperAdmins(database, [
      verifiedEmail.toUpperCase(),
      unverifiedEmail,
      `missing-${suffix}@example.test`,
    ]);
    expect(first).toEqual({
      configured: 3,
      promoted: 1,
      alreadyConfigured: 0,
      missing: 1,
      unverified: 1,
    });
    expect(
      await database
        .collection<StringDocument>("user")
        .findOne({ _id: verifiedUserId }),
    ).toMatchObject({ role: "PLATFORM_SUPER_ADMIN" });
    expect(
      await database
        .collection<StringDocument>("user")
        .findOne({ _id: unverifiedUserId }),
    ).toMatchObject({ role: "user" });
    expect(
      await database.collection("session").countDocuments({
        userId: verifiedUserId,
      }),
    ).toBe(0);
    expect(
      await database.collection("platformAuditLogs").countDocuments({
        entityId: verifiedUserId,
        action: "platform.super_admin.bootstrapped",
      }),
    ).toBe(1);

    const second = await bootstrapConfiguredSuperAdmins(database, [
      verifiedEmail,
    ]);
    expect(second.alreadyConfigured).toBe(1);
    expect(second.promoted).toBe(0);
    expect(
      await database.collection("platformAuditLogs").countDocuments({
        entityId: verifiedUserId,
      }),
    ).toBe(1);
  });

  it("does not grant request-time platform role assignment", () => {
    expect(
      betterAuthPlatformRoles.PLATFORM_SUPER_ADMIN.authorize({
        user: ["set-role"],
      }).success,
    ).toBe(false);
    expect(
      betterAuthPlatformRoles.PLATFORM_SUPER_ADMIN.authorize({
        user: ["list", "get", "update"],
      }).success,
    ).toBe(true);
  });

  it("returns only aggregate platform metadata from a verified context", async () => {
    const context: VerifiedPlatformContext = {
      userId: verifiedUserId,
      sessionId: `verified_session_${suffix}`,
      name: "Platform Verified",
      email: verifiedEmail,
      role: "PLATFORM_SUPER_ADMIN",
      twoFactorEnabled: true,
      sessionAssured: true,
      access: "allow",
      requestId: `request_${suffix}`,
    };
    const overview = await getPlatformOverview(context, database);
    expect(overview.tenants.byBillingStatus).toContainEqual({
      key: `platform_status_${suffix}`,
      count: 1,
    });
    expect(overview.tenants.byPlan).toContainEqual({
      key: `platform_plan_${suffix}`,
      count: 1,
    });
    expect(overview.subscriptions.byStatus).toContainEqual({
      key: `platform_subscription_${suffix}`,
      count: 1,
    });
    expect(overview.webhooks.recentTypes).toContainEqual({
      key: `platform.event.${suffix}`,
      count: 1,
    });
    expect(overview.webhooks.recentTypes).not.toContainEqual(
      expect.objectContaining({ key: `unverified.secret.${suffix}` }),
    );
    expect(Object.keys(overview).sort()).toEqual([
      "generatedAt",
      "metrics",
      "subscriptions",
      "system",
      "tenants",
      "webhooks",
    ]);
    const serialized = JSON.stringify(overview);
    expect(serialized).not.toContain(`DO_NOT_EXPOSE_BUSINESS_${suffix}`);
    expect(serialized).not.toContain(`DO_NOT_EXPOSE_PRODUCT_${suffix}`);
    expect(serialized).not.toContain(tenantId);
  });
});
