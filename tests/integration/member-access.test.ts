import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  materializeInvitationStoreAssignments,
  validateTenantStoreIds,
} from "@/modules/members/member-service";
import { resolvePermissions } from "@/modules/permissions/permissions";
import type { TenantContext } from "@/server/tenancy/context";
import { getWorkspaceShellData } from "@/server/tenancy/workspace";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)("member store access isolation", () => {
  const suffix = crypto.randomUUID();
  const tenantId = `org_member_${suffix}`;
  const secondTenantId = `org_member_second_${suffix}`;
  const foreignTenantId = `org_member_foreign_${suffix}`;
  const userId = `usr_member_${suffix}`;
  const membershipId = `mem_member_${suffix}`;
  const secondMembershipId = `mem_member_second_${suffix}`;
  const storeId = `store_member_${suffix}`;
  const secondStoreId = `store_member_second_${suffix}`;
  const foreignStoreId = `store_member_foreign_${suffix}`;
  const invitationId = `inv_member_${suffix}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;

  const context: TenantContext = {
    tenantId,
    tenantSlug: `member-${suffix}`,
    userId,
    sessionId: `session_member_${suffix}`,
    membershipId,
    roles: ["OWNER"],
    permissions: resolvePermissions(["OWNER"]),
    allowedStoreIds: new Set([storeId, secondStoreId]),
    activeStoreId: secondStoreId,
    requestId: `request_member_${suffix}`,
  };

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringDocument>("user").insertOne({
      _id: userId,
      name: "Integration Owner",
      email: `member-${suffix}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await database.collection<StringDocument>("tenantProfiles").insertMany([
      {
        _id: `profile_member_${suffix}`,
        tenantId,
        slug: context.tenantSlug,
        businessName: "Member Access Retail",
        planKey: "growth",
        billingStatus: "trialing",
        trialEndsAt: new Date(now.getTime() + 86_400_000),
        createdAt: now,
      },
      {
        _id: `profile_member_second_${suffix}`,
        tenantId: secondTenantId,
        slug: `second-${suffix}`,
        businessName: "Authorized Second Retail",
        planKey: "starter",
        billingStatus: "trialing",
        trialEndsAt: new Date(now.getTime() + 86_400_000),
        createdAt: now,
      },
      {
        _id: `profile_member_foreign_${suffix}`,
        tenantId: foreignTenantId,
        slug: `foreign-${suffix}`,
        businessName: "Foreign Retail",
        planKey: "business",
        billingStatus: "trialing",
        trialEndsAt: new Date(now.getTime() + 86_400_000),
        createdAt: now,
      },
    ]);
    await database.collection<StringDocument>("member").insertMany([
      {
        _id: membershipId,
        organizationId: tenantId,
        userId,
        role: "owner",
        createdAt: now,
      },
      {
        _id: secondMembershipId,
        organizationId: secondTenantId,
        userId,
        role: "viewer",
        createdAt: now,
      },
    ]);
    await database.collection<StringDocument>("stores").insertMany([
      {
        _id: storeId,
        tenantId,
        code: "ONE",
        name: "First Store",
        status: "active",
        createdAt: now,
      },
      {
        _id: secondStoreId,
        tenantId,
        code: "TWO",
        name: "Second Store",
        status: "active",
        createdAt: now,
      },
      {
        _id: foreignStoreId,
        tenantId: foreignTenantId,
        code: "FOREIGN",
        name: "Foreign Store",
        status: "active",
        createdAt: now,
      },
    ]);
  });

  afterAll(async () => {
    for (const collection of [
      "auditLogs",
      "invitationStoreAssignments",
      "memberStoreAssignments",
      "sessionStoreSelections",
      "products",
      "stores",
      "tenantProfiles",
    ])
      await database.collection(collection).deleteMany({
        tenantId: { $in: [tenantId, secondTenantId, foreignTenantId] },
      });
    await database.collection("member").deleteMany({ userId });
    await database
      .collection<StringDocument>("user")
      .deleteOne({ _id: userId });
    await client.close();
  });

  it("projects only membership-authorized businesses and the selected active store", async () => {
    const workspace = await getWorkspaceShellData(context);
    expect(
      workspace.businesses.map((business) => business.tenantId).sort(),
    ).toEqual([tenantId, secondTenantId].sort());
    expect(workspace.businesses).not.toContainEqual(
      expect.objectContaining({ tenantId: foreignTenantId }),
    );
    expect(workspace.activeStoreId).toBe(secondStoreId);
    expect(workspace.storeName).toBe("Second Store");
  });

  it("rejects a store from another tenant", async () => {
    await expect(
      validateTenantStoreIds(database, context, [storeId, foreignStoreId]),
    ).rejects.toMatchObject({
      reason: "invalid_stores",
    });
  });

  it("materializes only active same-tenant invitation assignments idempotently", async () => {
    await database
      .collection<StringDocument>("invitationStoreAssignments")
      .insertMany([
        {
          _id: `isa_member_${suffix}`,
          tenantId,
          invitationId,
          storeId,
        },
        {
          _id: `isa_member_foreign_${suffix}`,
          tenantId: foreignTenantId,
          invitationId,
          storeId: foreignStoreId,
        },
      ]);
    const acceptedMembershipId = `mem_accepted_${suffix}`;
    await materializeInvitationStoreAssignments(
      tenantId,
      invitationId,
      acceptedMembershipId,
      userId,
      context.requestId,
    );
    await materializeInvitationStoreAssignments(
      tenantId,
      invitationId,
      acceptedMembershipId,
      userId,
      context.requestId,
    );
    expect(
      await database.collection("memberStoreAssignments").countDocuments({
        tenantId,
        membershipId: acceptedMembershipId,
        storeId,
      }),
    ).toBe(1);
    expect(
      await database.collection("memberStoreAssignments").countDocuments({
        tenantId,
        membershipId: acceptedMembershipId,
        storeId: foreignStoreId,
      }),
    ).toBe(0);
    expect(
      await database.collection("invitationStoreAssignments").countDocuments({
        tenantId,
        invitationId,
      }),
    ).toBe(0);
  });
});
