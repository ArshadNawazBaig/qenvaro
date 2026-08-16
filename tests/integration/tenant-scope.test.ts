import { MongoClient } from "mongodb";
import { beforeAll, describe, expect, it } from "vitest";
import { resolvePermissions } from "@/modules/permissions/permissions";
import { productListQuerySchema } from "@/modules/products/schemas";
import { ProductRepository } from "@/server/repositories/products";
import type { TenantContext } from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";

function context(
  tenantId: string,
  tenantSlug: string,
  storeId: string,
): TenantContext {
  return {
    tenantId,
    tenantSlug,
    userId: "integration_test",
    sessionId: "integration_test_session",
    membershipId: "integration_test",
    roles: ["OWNER"],
    permissions: resolvePermissions(["OWNER"]),
    allowedStoreIds: new Set([storeId]),
    activeStoreId: storeId,
    requestId: crypto.randomUUID(),
  };
}

describe.skipIf(!enabled)("tenant repository isolation", () => {
  beforeAll(async () => {
    const uri = process.env.MONGODB_URI;
    expect(uri).toBeTruthy();
    const client = new MongoClient(uri!);
    try {
      await client.connect();
      const database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
      await expect(database.command({ ping: 1 })).resolves.toMatchObject({
        ok: 1,
      });
      await expect(
        database.collection("schemaMigrations").countDocuments(),
      ).resolves.toBe(17);
    } finally {
      await client.close();
    }
  });

  it("never returns another tenant's same-named catalog record", async () => {
    const repository = new ProductRepository();
    const query = productListQuerySchema.parse({ q: "Growth Suite" });
    const [northstar, harbor] = await Promise.all([
      repository.list(
        context("org_northstar", "northstar-goods", "store_northstar_downtown"),
        query,
      ),
      repository.list(
        context("org_harborpine", "harbor-and-pine", "store_harbor_main"),
        query,
      ),
    ]);

    expect(northstar.total).toBe(1);
    expect(harbor.total).toBe(1);
    expect(northstar.items[0]?.id).toBe("prd_growth_suite");
    expect(harbor.items[0]?.id).toBe("prd_harbor_growth");
    expect(northstar.items[0]?.id).not.toBe(harbor.items[0]?.id);
  });
});
