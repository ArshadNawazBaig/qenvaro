import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TenantOnboardingService } from "@/modules/tenants/onboarding-service";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringIdDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)("tenant onboarding transaction", () => {
  const tenantId = `org_test_${crypto.randomUUID()}`;
  const userId = `usr_test_${crypto.randomUUID()}`;
  const membershipId = `mem_test_${crypto.randomUUID()}`;
  const slug = `integration-${crypto.randomUUID().slice(0, 8)}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringIdDocument>("organization").insertOne({
      _id: tenantId,
      name: "Integration Retail",
      slug,
      createdAt: now,
    });
    await database.collection<StringIdDocument>("member").insertOne({
      _id: membershipId,
      organizationId: tenantId,
      userId,
      role: "owner",
      createdAt: now,
    });
  });

  afterAll(async () => {
    for (const collection of [
      "auditLogs",
      "memberStoreAssignments",
      "stores",
      "tenantProfiles",
    ])
      await database.collection(collection).deleteMany({ tenantId });
    await database
      .collection("member")
      .deleteMany({ organizationId: tenantId });
    await database
      .collection<StringIdDocument>("organization")
      .deleteOne({ _id: tenantId });
    await client.close();
  });

  it("atomically creates the tenant profile, first store, owner assignment, and audit", async () => {
    const result = await new TenantOnboardingService().initialize(
      {
        tenantId,
        userId,
        requestId: `req_${crypto.randomUUID()}`,
      },
      {
        businessName: "Integration Retail",
        businessSlug: slug,
        storeName: "Main Store",
        storeCode: "main",
        planKey: "growth",
        currency: "PKR",
        locale: "ur-PK",
        timezone: "Asia/Karachi",
      },
    );

    const [profile, store, assignment, audit] = await Promise.all([
      database.collection("tenantProfiles").findOne({ tenantId }),
      database.collection<StringIdDocument>("stores").findOne({
        tenantId,
        _id: result.storeId,
      }),
      database.collection("memberStoreAssignments").findOne({
        tenantId,
        membershipId,
        storeId: result.storeId,
      }),
      database.collection("auditLogs").findOne({
        tenantId,
        action: "tenant.onboarding.completed",
      }),
    ]);

    expect(result.tenantSlug).toBe(slug);
    expect(profile).toMatchObject({
      tenantId,
      slug,
      currency: "PKR",
      planKey: "growth",
      billingStatus: "trialing",
    });
    expect(profile?.trialEndsAt).toBeInstanceOf(Date);
    expect(store).toMatchObject({ code: "MAIN", status: "active" });
    expect(assignment).toBeTruthy();
    expect(audit).toMatchObject({ actorId: userId, entityId: tenantId });
  });
});
