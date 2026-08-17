import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolvePermissions } from "@/modules/permissions/permissions";
import { GlobalSearchRepository } from "@/server/repositories/global-search";
import type { TenantContext } from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)("tenant global search", () => {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const tenantId = `org_search_${suffix}`;
  const otherTenantId = `org_search_other_${suffix}`;
  const storeId = `store_search_${suffix}`;
  const hiddenStoreId = `store_search_hidden_${suffix}`;
  const userId = `user_search_${suffix}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;

  const ownerContext: TenantContext = {
    tenantId,
    tenantSlug: `search-${suffix}`,
    userId,
    sessionId: `session_search_${suffix}`,
    membershipId: `member_search_${suffix}`,
    roles: ["OWNER"],
    permissions: resolvePermissions(["OWNER"]),
    allowedStoreIds: new Set([storeId]),
    activeStoreId: storeId,
    requestId: `request_search_${suffix}`,
  };

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringDocument>("products").insertMany([
      {
        _id: `product_visible_${suffix}`,
        tenantId,
        name: "Northstar Register",
        sku: "NORTH-1",
        normalizedSku: "NORTH-1",
        category: "Hardware",
        allowedStoreIds: [storeId],
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `product_hidden_${suffix}`,
        tenantId,
        name: "Northstar Hidden Stock",
        sku: "NORTH-HIDDEN",
        normalizedSku: "NORTH-HIDDEN",
        category: "Hardware",
        allowedStoreIds: [hiddenStoreId],
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `product_other_${suffix}`,
        tenantId: otherTenantId,
        name: "Northstar Other Tenant",
        sku: "NORTH-OTHER",
        normalizedSku: "NORTH-OTHER",
        category: "Hardware",
        allowedStoreIds: [storeId],
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.collection<StringDocument>("customers").insertMany([
      {
        _id: `customer_visible_${suffix}`,
        tenantId,
        name: "Northstar Customer",
        code: "CUS-NORTH",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `customer_other_${suffix}`,
        tenantId: otherTenantId,
        name: "Northstar Private Customer",
        code: "CUS-OTHER",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.collection<StringDocument>("employees").insertMany([
      {
        _id: `employee_visible_${suffix}`,
        tenantId,
        employeeCode: "EMP-NORTH",
        name: "Northstar Employee",
        jobTitle: "Manager",
        department: "Retail",
        storeIds: [storeId],
        linkedUserId: userId,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `employee_hidden_${suffix}`,
        tenantId,
        employeeCode: "EMP-HIDDEN",
        name: "Northstar Hidden Employee",
        jobTitle: "Manager",
        department: "Retail",
        storeIds: [hiddenStoreId],
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  afterAll(async () => {
    if (!database) return;
    for (const collection of ["products", "customers", "employees"])
      await database.collection(collection).deleteMany({
        tenantId: { $in: [tenantId, otherTenantId] },
      });
    await client.close();
  });

  it("returns only permitted tenant and store results", async () => {
    const results = await new GlobalSearchRepository().search(
      ownerContext,
      "Northstar",
    );
    expect(results.map((result) => result.title)).toEqual(
      expect.arrayContaining([
        "Northstar Register",
        "Northstar Customer",
        "Northstar Employee",
      ]),
    );
    expect(results.map((result) => result.title)).not.toEqual(
      expect.arrayContaining([
        "Northstar Hidden Stock",
        "Northstar Other Tenant",
        "Northstar Private Customer",
        "Northstar Hidden Employee",
      ]),
    );
    expect(
      results.every((result) =>
        result.href.startsWith(`/app/${ownerContext.tenantSlug}/`),
      ),
    ).toBe(true);
  });

  it("does not reveal result types the member cannot read", async () => {
    const employeeResults = await new GlobalSearchRepository().search(
      {
        ...ownerContext,
        roles: ["EMPLOYEE"],
        permissions: resolvePermissions(["EMPLOYEE"]),
      },
      "Northstar",
    );
    expect(employeeResults).toHaveLength(1);
    expect(employeeResults[0]).toMatchObject({
      kind: "employee",
      title: "Northstar Employee",
    });
  });
});
