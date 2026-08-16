import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CategoryDuplicateError,
  CategoryService,
  CategoryVersionConflictError,
} from "@/modules/categories/service";
import { categoryListQuerySchema } from "@/modules/categories/schemas";
import {
  PermissionError,
  resolvePermissions,
} from "@/modules/permissions/permissions";
import {
  ProductCategoryUnavailableError,
  ProductService,
} from "@/modules/products/service";
import { CategoryRepository } from "@/server/repositories/categories";
import type { TenantContext } from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringIdDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)("category lifecycle transaction", () => {
  const suffix = crypto.randomUUID();
  const tenantId = `org_category_${suffix}`;
  const otherTenantId = `org_category_other_${suffix}`;
  const storeId = `store_category_${suffix}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;
  let categoryId: string;
  let productId: string;

  const ownerContext: TenantContext = {
    tenantId,
    tenantSlug: `category-${suffix}`,
    userId: `usr_category_${suffix}`,
    sessionId: `session_category_${suffix}`,
    membershipId: `member_category_${suffix}`,
    roles: ["OWNER"],
    permissions: resolvePermissions(["OWNER"]),
    allowedStoreIds: new Set([storeId]),
    activeStoreId: storeId,
    requestId: `request_category_${suffix}`,
  };

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringIdDocument>("tenantProfiles").insertMany([
      {
        _id: `profile_category_${suffix}`,
        tenantId,
        slug: ownerContext.tenantSlug,
        businessName: "Category Integration",
        currency: "USD",
        locale: "en-US",
        timezone: "UTC",
        planKey: "growth",
        billingStatus: "trialing",
        trialEndsAt: new Date(now.getTime() + 86_400_000),
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `profile_category_other_${suffix}`,
        tenantId: otherTenantId,
        slug: `category-other-${suffix}`,
        businessName: "Other Category Integration",
        currency: "USD",
        locale: "en-US",
        timezone: "UTC",
        planKey: "starter",
        billingStatus: "trialing",
        trialEndsAt: new Date(now.getTime() + 86_400_000),
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.collection<StringIdDocument>("stores").insertOne({
      _id: storeId,
      tenantId,
      code: "MAIN",
      name: "Main Store",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  });

  afterAll(async () => {
    for (const collection of [
      "auditLogs",
      "categories",
      "inventoryLevels",
      "inventoryMovements",
      "productVariants",
      "products",
      "stores",
      "tenantProfiles",
      "units",
    ])
      await database.collection(collection).deleteMany({
        tenantId: { $in: [tenantId, otherTenantId] },
      });
    await client.close();
  });

  it("enforces normalized uniqueness per tenant", async () => {
    const service = new CategoryService();
    const created = await service.create(ownerContext, {
      name: "Hardware",
      description: "Counter and store devices.",
    });
    categoryId = created.id;
    await expect(
      service.create(ownerContext, {
        name: "  HARDWARE ",
        description: "Duplicate name.",
      }),
    ).rejects.toBeInstanceOf(CategoryDuplicateError);
    await expect(
      service.create(
        {
          ...ownerContext,
          tenantId: otherTenantId,
          tenantSlug: `category-other-${suffix}`,
        },
        { name: "Hardware", description: "Allowed in another tenant." },
      ),
    ).resolves.toMatchObject({ version: 1 });
  });

  it("lists only tenant-owned categories and assignment counts", async () => {
    productId = (
      await new ProductService().createSimple(ownerContext, {
        name: "Counter Display",
        sku: `CAT-${suffix.slice(0, 8)}`,
        category: "Hardware",
        priceMinor: 14_900,
        openingStock: 6,
      })
    ).id;
    const result = await new CategoryRepository().list(
      ownerContext,
      categoryListQuerySchema.parse({ q: "Hardware" }),
    );
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: categoryId,
      name: "Hardware",
      activeProductCount: 1,
      totalProductCount: 1,
    });
  });

  it("blocks assigned archive and unauthorized creation", async () => {
    await expect(
      new CategoryService().archive(ownerContext, {
        categoryId,
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ productCount: 1 });
    await expect(
      new CategoryService().create(
        {
          ...ownerContext,
          roles: ["VIEWER"],
          permissions: resolvePermissions(["VIEWER"]),
        },
        { name: "Unauthorized", description: "Should not persist." },
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("renames active assignments atomically and rejects stale writes", async () => {
    const result = await new CategoryService().update(ownerContext, {
      categoryId,
      expectedVersion: 1,
      name: "Retail Hardware",
      description: "Updated devices and fixtures.",
    });
    const [category, product, audit] = await Promise.all([
      database.collection<StringIdDocument>("categories").findOne({
        _id: categoryId,
        tenantId,
      }),
      database.collection<StringIdDocument>("products").findOne({
        _id: productId,
        tenantId,
      }),
      database.collection("auditLogs").findOne({
        tenantId,
        entityId: categoryId,
        action: "category.updated",
      }),
    ]);
    expect(result).toEqual({ version: 2, updatedProductCount: 1 });
    expect(category).toMatchObject({ name: "Retail Hardware", version: 2 });
    expect(product).toMatchObject({ category: "Retail Hardware", version: 2 });
    expect(audit).toMatchObject({ actorId: ownerContext.userId });

    await expect(
      new CategoryService().update(ownerContext, {
        categoryId,
        expectedVersion: 1,
        name: "Stale category",
        description: "Should not persist.",
      }),
    ).rejects.toBeInstanceOf(CategoryVersionConflictError);
    await expect(
      new ProductService().update(ownerContext, {
        productId,
        expectedVersion: 2,
        name: "Counter Display",
        subtitle: "Simple product",
        sku: `CAT-${suffix.slice(0, 8)}`,
        category: "Missing Category",
        priceMinor: 14_900,
        reorderLevel: 5,
        status: "active",
      }),
    ).rejects.toBeInstanceOf(ProductCategoryUnavailableError);
  });

  it("archives after active assignments are retired and retains history", async () => {
    await new ProductService().archive(ownerContext, {
      productId,
      expectedVersion: 2,
    });
    const first = await new CategoryService().archive(ownerContext, {
      categoryId,
      expectedVersion: 2,
    });
    const second = await new CategoryService().archive(ownerContext, {
      categoryId,
      expectedVersion: 2,
    });
    const [category, archivedProduct, audit] = await Promise.all([
      database.collection<StringIdDocument>("categories").findOne({
        _id: categoryId,
        tenantId,
      }),
      database.collection<StringIdDocument>("products").findOne({
        _id: productId,
        tenantId,
      }),
      database.collection("auditLogs").findOne({
        tenantId,
        entityId: categoryId,
        action: "category.archived",
      }),
    ]);
    expect(first).toEqual({ version: 3, alreadyArchived: false });
    expect(second).toEqual({ version: 3, alreadyArchived: true });
    expect(category).toMatchObject({ status: "archived", version: 3 });
    expect(archivedProduct).toMatchObject({
      status: "archived",
      category: "Retail Hardware",
      stock: 6,
    });
    expect(audit).toMatchObject({ actorId: ownerContext.userId });
  });
});
