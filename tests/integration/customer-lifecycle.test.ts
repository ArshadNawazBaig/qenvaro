import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { customerListQuerySchema } from "@/modules/customers/schemas";
import {
  CustomerArchivedError,
  CustomerNotFoundError,
  CustomerService,
  CustomerVersionConflictError,
} from "@/modules/customers/service";
import {
  PermissionError,
  resolvePermissions,
} from "@/modules/permissions/permissions";
import { CustomerRepository } from "@/server/repositories/customers";
import type { TenantContext } from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringIdDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)("customer lifecycle transaction", () => {
  const suffix = crypto.randomUUID();
  const tenantId = `org_customer_${suffix}`;
  const otherTenantId = `org_customer_other_${suffix}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;
  let miraId: string;
  let miraVersion = 1;

  const ownerContext: TenantContext = {
    tenantId,
    tenantSlug: `customer-${suffix}`,
    userId: `usr_customer_${suffix}`,
    sessionId: `session_customer_${suffix}`,
    membershipId: `member_customer_${suffix}`,
    roles: ["OWNER"],
    permissions: resolvePermissions(["OWNER"]),
    allowedStoreIds: new Set(),
    activeStoreId: null,
    requestId: `request_customer_${suffix}`,
  };

  const customerFields = (name: string) => ({
    name,
    company: name === "Mira Cole" ? "Cole Studio" : "",
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.test`,
    phone: name === "Mira Cole" ? "+92 300 555 0199" : "",
    address: {
      line1: name === "Mira Cole" ? "48 Test Street" : "",
      line2: "",
      city: name === "Mira Cole" ? "Karachi" : "",
      region: name === "Mira Cole" ? "Sindh" : "",
      postalCode: "",
      countryCode: name === "Mira Cole" ? "PK" : "",
    },
    notes: name === "Mira Cole" ? "Private integration note" : "",
  });

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringIdDocument>("tenantProfiles").insertMany([
      {
        _id: `profile_customer_${suffix}`,
        tenantId,
        slug: ownerContext.tenantSlug,
        businessName: "Customer Integration",
        currency: "PKR",
        locale: "en-PK",
        timezone: "Asia/Karachi",
        planKey: "growth",
        billingStatus: "trialing",
        trialEndsAt: new Date(now.getTime() + 86_400_000),
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `profile_customer_other_${suffix}`,
        tenantId: otherTenantId,
        slug: `customer-other-${suffix}`,
        businessName: "Other Customer Integration",
        currency: "PKR",
        locale: "en-PK",
        timezone: "Asia/Karachi",
        planKey: "starter",
        billingStatus: "trialing",
        trialEndsAt: new Date(now.getTime() + 86_400_000),
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  afterAll(async () => {
    for (const collection of ["auditLogs", "customers", "tenantProfiles"])
      await database.collection(collection).deleteMany({
        tenantId: { $in: [tenantId, otherTenantId] },
      });
    await client.close();
  });

  it("creates server-owned identities and permits overlapping tenant data", async () => {
    const service = new CustomerService();
    const created = await service.create(
      ownerContext,
      customerFields("Mira Cole"),
    );
    miraId = created.id;
    expect(created.code).toMatch(/^C-[A-Z0-9_-]{8}$/);

    await service.create(
      {
        ...ownerContext,
        tenantId: otherTenantId,
        tenantSlug: `other-${suffix}`,
      },
      customerFields("Mira Cole"),
    );
    for (const name of [
      "Avery Stone",
      "Bruno Lake",
      "Celine Moss",
      "Daria Reed",
      "Evan Hart",
    ])
      await service.create(ownerContext, customerFields(name));

    const stored = await database
      .collection<StringIdDocument>("customers")
      .findOne({
        _id: miraId,
        tenantId,
      });
    expect(stored).toMatchObject({
      normalizedName: "mira cole",
      normalizedEmail: "mira.cole@example.test",
      normalizedPhone: "+923005550199",
      status: "active",
      version: 1,
    });
  });

  it("keeps search, pagination, metrics, and reads tenant scoped", async () => {
    const repository = new CustomerRepository();
    const [search, firstPage, secondPage, metrics] = await Promise.all([
      repository.list(
        ownerContext,
        customerListQuerySchema.parse({ q: "mira.cole@example.test" }),
      ),
      repository.list(
        ownerContext,
        customerListQuerySchema.parse({ pageSize: 5 }),
      ),
      repository.list(
        ownerContext,
        customerListQuerySchema.parse({ page: 2, pageSize: 5 }),
      ),
      repository.metrics(ownerContext),
    ]);
    expect(search.items).toHaveLength(1);
    expect(search.items[0]).toMatchObject({ id: miraId, name: "Mira Cole" });
    expect(firstPage).toMatchObject({ total: 6 });
    expect(firstPage.items).toHaveLength(5);
    expect(secondPage.items).toHaveLength(1);
    expect(metrics).toEqual({ total: 6, active: 6, archived: 0, reachable: 6 });

    await expect(
      repository.list(
        {
          ...ownerContext,
          roles: ["EMPLOYEE"],
          permissions: resolvePermissions(["EMPLOYEE"]),
        },
        customerListQuerySchema.parse({}),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("enforces write permissions, tenant ownership, and optimistic versions", async () => {
    const service = new CustomerService();
    await expect(
      service.create(
        {
          ...ownerContext,
          roles: ["VIEWER"],
          permissions: resolvePermissions(["VIEWER"]),
        },
        customerFields("Unauthorized Customer"),
      ),
    ).rejects.toBeInstanceOf(PermissionError);

    await expect(
      service.update(ownerContext, {
        customerId: miraId,
        expectedVersion: 1,
        ...customerFields("Cross Tenant Attempt"),
      }),
    ).resolves.toEqual({ version: 2 });
    miraVersion = 2;
    await expect(
      service.update(ownerContext, {
        customerId: miraId,
        expectedVersion: 1,
        ...customerFields("Stale Attempt"),
      }),
    ).rejects.toBeInstanceOf(CustomerVersionConflictError);

    const otherCustomer = await database
      .collection<StringIdDocument>("customers")
      .findOne({
        tenantId: otherTenantId,
      });
    await expect(
      service.update(ownerContext, {
        customerId: String(otherCustomer?._id),
        expectedVersion: 1,
        ...customerFields("Cross Tenant Attempt"),
      }),
    ).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  it("archives idempotently, blocks further edits, and writes PII-safe audits", async () => {
    const service = new CustomerService();
    await expect(
      service.archive(ownerContext, {
        customerId: miraId,
        expectedVersion: miraVersion,
      }),
    ).resolves.toEqual({ version: 3, alreadyArchived: false });
    await expect(
      service.archive(ownerContext, { customerId: miraId, expectedVersion: 1 }),
    ).resolves.toEqual({ version: 3, alreadyArchived: true });
    await expect(
      service.update(ownerContext, {
        customerId: miraId,
        expectedVersion: 3,
        ...customerFields("Archived Edit"),
      }),
    ).rejects.toBeInstanceOf(CustomerArchivedError);

    const audits = await database
      .collection("auditLogs")
      .find({ tenantId, entityId: miraId })
      .sort({ createdAt: 1 })
      .toArray();
    expect(audits.map((audit) => audit.action)).toEqual([
      "customer.created",
      "customer.updated",
      "customer.archived",
    ]);
    const serialized = JSON.stringify(audits);
    for (const privateValue of [
      "Mira Cole",
      "mira.cole@example.test",
      "+92 300 555 0199",
      "48 Test Street",
      "Private integration note",
    ])
      expect(serialized).not.toContain(privateValue);
    expect(audits[0]).toMatchObject({
      changes: {
        after: {
          status: "active",
          contactMethods: ["email", "phone"],
          hasCompany: true,
        },
      },
    });
  });

  it("has migration-backed customer query indexes", async () => {
    const names = (await database.collection("customers").indexes()).map(
      (index) => index.name,
    );
    expect(names).toEqual(
      expect.arrayContaining([
        "tenant_customer_code_unique",
        "tenant_customer_name",
        "tenant_customer_status_name",
        "tenant_customer_updated",
        "tenant_customer_created",
      ]),
    );
  });
});
