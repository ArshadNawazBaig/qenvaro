import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PermissionError,
  resolvePermissions,
} from "@/modules/permissions/permissions";
import {
  ProductService,
  ProductTagUnavailableError,
} from "@/modules/products/service";
import { tagListQuerySchema } from "@/modules/tags/schemas";
import {
  TagDuplicateError,
  TagService,
  TagVersionConflictError,
} from "@/modules/tags/service";
import { ProductRepository } from "@/server/repositories/products";
import { TagRepository } from "@/server/repositories/tags";
import type { TenantContext } from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringIdDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)("tag lifecycle transaction", () => {
  const suffix = crypto.randomUUID();
  const tenantId = `org_tag_${suffix}`;
  const otherTenantId = `org_tag_other_${suffix}`;
  const storeId = `store_tag_${suffix}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;
  let tagId: string;
  let otherTagId: string;
  let productId: string;

  const ownerContext: TenantContext = {
    tenantId,
    tenantSlug: `tag-${suffix}`,
    userId: `usr_tag_${suffix}`,
    sessionId: `session_tag_${suffix}`,
    membershipId: `member_tag_${suffix}`,
    roles: ["OWNER"],
    permissions: resolvePermissions(["OWNER"]),
    allowedStoreIds: new Set([storeId]),
    activeStoreId: storeId,
    requestId: `request_tag_${suffix}`,
  };

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringIdDocument>("tenantProfiles").insertMany([
      {
        _id: `profile_tag_${suffix}`,
        tenantId,
        slug: ownerContext.tenantSlug,
        businessName: "Tag Integration",
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
        _id: `profile_tag_other_${suffix}`,
        tenantId: otherTenantId,
        slug: `tag-other-${suffix}`,
        businessName: "Other Tag Integration",
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
      "tags",
      "stores",
      "tenantProfiles",
    ])
      await database.collection(collection).deleteMany({
        tenantId: { $in: [tenantId, otherTenantId] },
      });
    await client.close();
  });

  it("enforces normalized uniqueness within each tenant", async () => {
    const service = new TagService();
    const created = await service.create(ownerContext, {
      name: "Featured",
      description: "Products highlighted in the catalog.",
      color: "blue",
    });
    tagId = created.id;

    await expect(
      service.create(ownerContext, {
        name: "  FEATURED ",
        description: "Duplicate normalized name.",
        color: "rose",
      }),
    ).rejects.toBeInstanceOf(TagDuplicateError);

    const other = await service.create(
      {
        ...ownerContext,
        tenantId: otherTenantId,
        tenantSlug: `tag-other-${suffix}`,
      },
      {
        name: "Featured",
        description: "The same name is valid in another tenant.",
        color: "emerald",
      },
    );
    otherTagId = other.id;
  });

  it("assigns tags to products and reports tenant-scoped usage", async () => {
    productId = (
      await new ProductService().createSimple(ownerContext, {
        name: "Window Display",
        sku: `TAG-${suffix.slice(0, 8)}`,
        category: "Fixtures",
        priceMinor: 18_900,
        openingStock: 4,
        tagIds: [tagId],
      })
    ).id;

    const repository = new TagRepository();
    const [result, options, product] = await Promise.all([
      repository.list(
        ownerContext,
        tagListQuerySchema.parse({ q: "Featured" }),
      ),
      repository.activeOptions(ownerContext),
      new ProductRepository().detail(ownerContext, productId),
    ]);
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: tagId,
      activeProductCount: 1,
      totalProductCount: 1,
    });
    expect(options).toEqual([
      expect.objectContaining({ id: tagId, name: "Featured" }),
    ]);
    expect(product?.tagIds).toEqual([tagId]);
    expect(product?.tags).toEqual([
      expect.objectContaining({ id: tagId, name: "Featured" }),
    ]);
  });

  it("blocks assigned archive, unauthorized writes, and cross-tenant tags", async () => {
    await expect(
      new TagService().archive(ownerContext, {
        tagId,
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ productCount: 1 });

    await expect(
      new TagService().create(
        {
          ...ownerContext,
          roles: ["VIEWER"],
          permissions: resolvePermissions(["VIEWER"]),
        },
        {
          name: "Unauthorized",
          description: "Should not persist.",
          color: "slate",
        },
      ),
    ).rejects.toBeInstanceOf(PermissionError);

    await expect(
      new ProductService().update(ownerContext, {
        productId,
        expectedVersion: 1,
        name: "Window Display",
        subtitle: "Front window fixture",
        sku: `TAG-${suffix.slice(0, 8)}`,
        category: "Fixtures",
        priceMinor: 18_900,
        reorderLevel: 2,
        status: "active",
        tagIds: [otherTagId],
      }),
    ).rejects.toBeInstanceOf(ProductTagUnavailableError);
  });

  it("renames a tag without rewriting assignments and rejects stale writes", async () => {
    const result = await new TagService().update(ownerContext, {
      tagId,
      expectedVersion: 1,
      name: "Staff pick",
      description: "Products selected by the merchandising team.",
      color: "violet",
    });
    const [tag, product, audit] = await Promise.all([
      database.collection<StringIdDocument>("tags").findOne({
        _id: tagId,
        tenantId,
      }),
      database.collection<StringIdDocument>("products").findOne({
        _id: productId,
        tenantId,
      }),
      database.collection("auditLogs").findOne({
        tenantId,
        entityId: tagId,
        action: "tag.updated",
      }),
    ]);
    expect(result).toEqual({ version: 2 });
    expect(tag).toMatchObject({
      name: "Staff pick",
      color: "violet",
      version: 2,
    });
    expect(product).toMatchObject({ tagIds: [tagId], version: 1 });
    expect(audit).toMatchObject({ actorId: ownerContext.userId });

    await expect(
      new TagService().update(ownerContext, {
        tagId,
        expectedVersion: 1,
        name: "Stale tag",
        description: "Should not persist.",
        color: "amber",
      }),
    ).rejects.toBeInstanceOf(TagVersionConflictError);
  });

  it("archives after active assignments retire and retains history", async () => {
    await new ProductService().archive(ownerContext, {
      productId,
      expectedVersion: 1,
    });
    const first = await new TagService().archive(ownerContext, {
      tagId,
      expectedVersion: 2,
    });
    const second = await new TagService().archive(ownerContext, {
      tagId,
      expectedVersion: 2,
    });
    const [tag, archivedProduct, options, result, audit] = await Promise.all([
      database.collection<StringIdDocument>("tags").findOne({
        _id: tagId,
        tenantId,
      }),
      new ProductRepository().detail(ownerContext, productId),
      new TagRepository().activeOptions(ownerContext),
      new TagRepository().list(
        ownerContext,
        tagListQuerySchema.parse({ status: "archived" }),
      ),
      database.collection("auditLogs").findOne({
        tenantId,
        entityId: tagId,
        action: "tag.archived",
      }),
    ]);

    expect(first).toEqual({ version: 3, alreadyArchived: false });
    expect(second).toEqual({ version: 3, alreadyArchived: true });
    expect(tag).toMatchObject({ status: "archived", version: 3 });
    expect(archivedProduct).toMatchObject({
      status: "archived",
      tagIds: [tagId],
      tags: [expect.objectContaining({ id: tagId, name: "Staff pick" })],
    });
    expect(options).toEqual([]);
    expect(result.items[0]).toMatchObject({
      id: tagId,
      activeProductCount: 0,
      totalProductCount: 1,
    });
    expect(audit).toMatchObject({ actorId: ownerContext.userId });
  });
});
