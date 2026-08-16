import "server-only";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import { getMongoClient } from "@/server/db/client";
import { onboardingSchema, type OnboardingInput } from "./onboarding-schema";

type StringIdDocument = { _id: string } & Record<string, unknown>;

interface OnboardingIdentity {
  tenantId: string;
  userId: string;
  requestId: string;
}

export interface WorkspaceReference {
  tenantId: string;
  tenantSlug: string;
}

export class OnboardingInvariantError extends Error {
  constructor(
    public readonly reason:
      | "missing_store"
      | "organization_not_verified"
      | "owner_membership_not_verified"
      | "no_result",
  ) {
    super("Workspace onboarding invariant failed.");
    this.name = "OnboardingInvariantError";
  }
}

export async function findFirstWorkspaceForUser(
  userId: string,
): Promise<WorkspaceReference | null> {
  const client = await getMongoClient();
  const database = client.db(env.MONGODB_DATABASE);
  const memberships = await database
    .collection<{ organizationId: string; userId: string; createdAt: Date }>(
      "member",
    )
    .find({ userId }, { projection: { organizationId: 1 } })
    .sort({ createdAt: 1 })
    .limit(100)
    .toArray();
  if (memberships.length === 0) return null;
  const tenantIds = memberships.map((member) => member.organizationId);
  const profile = await database
    .collection<{ tenantId: string; slug: string; createdAt: Date }>(
      "tenantProfiles",
    )
    .find(
      { tenantId: { $in: tenantIds } },
      { projection: { tenantId: 1, slug: 1 } },
    )
    .sort({ createdAt: 1 })
    .limit(1)
    .next();
  return profile
    ? { tenantId: profile.tenantId, tenantSlug: profile.slug }
    : null;
}

export async function findOwnedOrganizationBySlug(
  userId: string,
  slug: string,
): Promise<{ id: string; name: string; slug: string } | null> {
  const client = await getMongoClient();
  const database = client.db(env.MONGODB_DATABASE);
  const organization = await database
    .collection<{ _id: string; name: string; slug: string }>("organization")
    .findOne({ slug }, { projection: { name: 1, slug: 1 } });
  if (!organization) return null;
  const membership = await database.collection("member").findOne(
    {
      organizationId: String(organization._id),
      userId,
      role: { $regex: /(^|,)owner(,|$)/ },
    },
    { projection: { _id: 1 } },
  );
  return membership
    ? {
        id: String(organization._id),
        name: organization.name,
        slug: organization.slug,
      }
    : null;
}

export class TenantOnboardingService {
  async initialize(
    identity: OnboardingIdentity,
    rawInput: OnboardingInput,
  ): Promise<{ tenantSlug: string; storeId: string }> {
    const input = onboardingSchema.parse(rawInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const storeId = createOpaqueId("store");
    const unitId = createOpaqueId("uom");
    const assignmentId = createOpaqueId("msa");
    const auditId = createOpaqueId("aud");
    let result: { tenantSlug: string; storeId: string } | undefined;

    await client.withSession(async (session) => {
      await session.withTransaction(async () => {
        const existing = await database
          .collection<{ slug: string }>("tenantProfiles")
          .findOne(
            { tenantId: identity.tenantId },
            { session, projection: { slug: 1 } },
          );
        if (existing) {
          const store = await database
            .collection<{ _id: string }>("stores")
            .findOne(
              { tenantId: identity.tenantId, deletedAt: { $exists: false } },
              { session, projection: { _id: 1 } },
            );
          if (!store) throw new OnboardingInvariantError("missing_store");
          result = {
            tenantSlug: existing.slug,
            storeId: String(store._id),
          };
          return;
        }

        const [organization, membership] = await Promise.all([
          database
            .collection<{ _id: string; slug: string }>("organization")
            .findOne(
              { _id: identity.tenantId, slug: input.businessSlug },
              { session, projection: { _id: 1 } },
            ),
          database.collection<{ _id: string; role: string }>("member").findOne(
            {
              organizationId: identity.tenantId,
              userId: identity.userId,
              role: { $regex: /(^|,)owner(,|$)/ },
            },
            { session, projection: { role: 1 } },
          ),
        ]);
        if (!organization)
          throw new OnboardingInvariantError("organization_not_verified");
        if (!membership)
          throw new OnboardingInvariantError("owner_membership_not_verified");

        const now = new Date();
        const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        await database.collection<StringIdDocument>("tenantProfiles").insertOne(
          {
            _id: createOpaqueId("tenant"),
            tenantId: identity.tenantId,
            slug: input.businessSlug,
            businessName: input.businessName,
            currency: input.currency,
            locale: input.locale,
            timezone: input.timezone,
            planKey: input.planKey,
            billingStatus: "trialing",
            billingSource: "signup_trial",
            trialEndsAt,
            inventorySettings: {
              allowNegativeStock: false,
              lowStockAlerts: {
                enabled: false,
                includeLowStock: true,
                includeOutOfStock: true,
                version: 1,
              },
            },
            onboardingVersion: 1,
            onboardingCompletedAt: now,
            createdAt: now,
            updatedAt: now,
            createdBy: identity.userId,
            updatedBy: identity.userId,
            version: 1,
          },
          { session },
        );
        await database.collection<StringIdDocument>("stores").insertOne(
          {
            _id: storeId,
            tenantId: identity.tenantId,
            code: input.storeCode,
            name: input.storeName,
            status: "active",
            timezone: input.timezone,
            createdAt: now,
            updatedAt: now,
            createdBy: identity.userId,
            updatedBy: identity.userId,
            version: 1,
          },
          { session },
        );
        await database.collection<StringIdDocument>("units").insertOne(
          {
            _id: unitId,
            tenantId: identity.tenantId,
            name: "Each",
            normalizedName: "each",
            symbol: "ea",
            normalizedSymbol: "ea",
            slug: `each-${unitId.slice(-8)}`,
            description: "Default unit for individually counted products.",
            status: "active",
            isDefault: true,
            version: 1,
            createdAt: now,
            updatedAt: now,
            createdBy: identity.userId,
            updatedBy: identity.userId,
          },
          { session },
        );
        await database
          .collection<StringIdDocument>("memberStoreAssignments")
          .insertOne(
            {
              _id: assignmentId,
              tenantId: identity.tenantId,
              membershipId: String(membership._id),
              storeId,
              createdAt: now,
              createdBy: identity.userId,
            },
            { session },
          );
        await database.collection<StringIdDocument>("auditLogs").insertOne(
          {
            _id: auditId,
            tenantId: identity.tenantId,
            actorId: identity.userId,
            action: "tenant.onboarding.completed",
            entityType: "tenant",
            entityId: identity.tenantId,
            requestId: identity.requestId,
            summary: "Created the organization profile and first store.",
            createdAt: now,
          },
          { session },
        );
        result = { tenantSlug: input.businessSlug, storeId };
      });
    });

    if (!result) throw new OnboardingInvariantError("no_result");
    return result;
  }
}
