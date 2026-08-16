import "server-only";
import type { ClientSession, Db } from "mongodb";
import { createOpaqueId } from "@/lib/utils";
import { requireTenantWriteEntitlement } from "@/modules/billing/entitlements";
import {
  archiveCategorySchema,
  createCategorySlug,
  createCategorySchema,
  normalizeCategoryName,
  updateCategorySchema,
  type ArchiveCategoryInput,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from "@/modules/categories/schemas";
import { requirePermission } from "@/modules/permissions/permissions";
import { env } from "@/config/env";
import { getMongoClient } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

type StringIdDocument = { _id: string } & Record<string, unknown>;

interface MutableCategoryDocument {
  _id: string;
  tenantId: string;
  name: string;
  normalizedName: string;
  slug: string;
  description: string;
  status: "active" | "archived";
  version: number;
  deletedAt?: Date;
}

interface TenantBillingProfile {
  planKey: string;
  billingStatus?: string;
  trialEndsAt?: Date;
  graceEndsAt?: Date;
  currentPeriodEndsAt?: Date;
}

export class CategoryNotFoundError extends Error {
  constructor() {
    super("The requested category was not found.");
    this.name = "CategoryNotFoundError";
  }
}

export class CategoryVersionConflictError extends Error {
  constructor() {
    super("This category changed after the page was loaded.");
    this.name = "CategoryVersionConflictError";
  }
}

export class CategoryArchivedError extends Error {
  constructor() {
    super("Archived categories cannot be edited.");
    this.name = "CategoryArchivedError";
  }
}

export class CategoryDuplicateError extends Error {
  constructor() {
    super("A category with that name already exists.");
    this.name = "CategoryDuplicateError";
  }
}

export class CategoryInUseError extends Error {
  constructor(public readonly productCount: number) {
    super("Assigned categories cannot be archived.");
    this.name = "CategoryInUseError";
  }
}

async function requireWriteAccess(
  database: Db,
  tenantId: string,
  session: ClientSession,
): Promise<void> {
  const profile = await database
    .collection<TenantBillingProfile>("tenantProfiles")
    .findOne(
      { tenantId },
      {
        session,
        projection: {
          planKey: 1,
          billingStatus: 1,
          trialEndsAt: 1,
          graceEndsAt: 1,
          currentPeriodEndsAt: 1,
        },
      },
    );
  if (!profile) throw new CategoryNotFoundError();
  requireTenantWriteEntitlement(profile);
}

export class CategoryService {
  async create(
    context: TenantContext,
    untrustedInput: CreateCategoryInput,
  ): Promise<{ id: string; version: number }> {
    requirePermission(context.permissions, "product:create");
    const input = createCategorySchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const categoryId = createOpaqueId("cat");
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const categories =
          database.collection<MutableCategoryDocument>("categories");
        const normalizedName = normalizeCategoryName(input.name);
        const duplicate = await categories.findOne(
          {
            tenantId: context.tenantId,
            normalizedName,
            deletedAt: { $exists: false },
          },
          { session, projection: { _id: 1 } },
        );
        if (duplicate) throw new CategoryDuplicateError();
        const now = new Date();
        await categories.insertOne(
          {
            _id: categoryId,
            tenantId: context.tenantId,
            name: input.name,
            normalizedName,
            slug: createCategorySlug(input.name, categoryId),
            description: input.description,
            status: "active",
            version: 1,
            createdAt: now,
            updatedAt: now,
            createdBy: context.userId,
            updatedBy: context.userId,
          } as MutableCategoryDocument,
          { session },
        );
        await database.collection<StringIdDocument>("auditLogs").insertOne(
          {
            _id: createOpaqueId("aud"),
            tenantId: context.tenantId,
            actorId: context.userId,
            action: "category.created",
            entityType: "category",
            entityId: categoryId,
            requestId: context.requestId,
            summary: "Created a catalog category.",
            changes: { after: { name: input.name, status: "active" } },
            createdAt: now,
          },
          { session },
        );
        return { id: categoryId, version: 1 };
      }),
    );
    if (!result) throw new Error("Category creation did not complete.");
    return result;
  }

  async update(
    context: TenantContext,
    untrustedInput: UpdateCategoryInput,
  ): Promise<{ version: number; updatedProductCount: number }> {
    requirePermission(context.permissions, "product:update");
    const input = updateCategorySchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const categories =
          database.collection<MutableCategoryDocument>("categories");
        const existing = await categories.findOne(
          {
            _id: input.categoryId,
            tenantId: context.tenantId,
            deletedAt: { $exists: false },
          },
          { session },
        );
        if (!existing) throw new CategoryNotFoundError();
        if (existing.status === "archived") throw new CategoryArchivedError();
        if (existing.version !== input.expectedVersion)
          throw new CategoryVersionConflictError();
        const normalizedName = normalizeCategoryName(input.name);
        if (normalizedName !== existing.normalizedName) {
          const duplicate = await categories.findOne(
            {
              tenantId: context.tenantId,
              normalizedName,
              _id: { $ne: input.categoryId },
              deletedAt: { $exists: false },
            },
            { session, projection: { _id: 1 } },
          );
          if (duplicate) throw new CategoryDuplicateError();
        }

        const now = new Date();
        const categoryUpdate = await categories.updateOne(
          {
            _id: input.categoryId,
            tenantId: context.tenantId,
            version: input.expectedVersion,
            status: "active",
            deletedAt: { $exists: false },
          },
          {
            $set: {
              name: input.name,
              normalizedName,
              description: input.description,
              updatedAt: now,
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (categoryUpdate.matchedCount !== 1)
          throw new CategoryVersionConflictError();

        let updatedProductCount = 0;
        if (existing.name !== input.name) {
          const productUpdate = await database
            .collection("products")
            .updateMany(
              {
                tenantId: context.tenantId,
                category: existing.name,
                status: { $in: ["active", "draft"] },
                deletedAt: { $exists: false },
              },
              {
                $set: {
                  category: input.name,
                  updatedAt: now,
                  updatedBy: context.userId,
                },
                $inc: { version: 1 },
              },
              { session },
            );
          updatedProductCount = productUpdate.modifiedCount;
        }
        await database.collection<StringIdDocument>("auditLogs").insertOne(
          {
            _id: createOpaqueId("aud"),
            tenantId: context.tenantId,
            actorId: context.userId,
            action: "category.updated",
            entityType: "category",
            entityId: input.categoryId,
            requestId: context.requestId,
            summary: "Updated a catalog category.",
            changes: {
              before: {
                name: existing.name,
                description: existing.description,
              },
              after: { name: input.name, description: input.description },
              updatedProductCount,
            },
            createdAt: now,
          },
          { session },
        );
        return {
          version: input.expectedVersion + 1,
          updatedProductCount,
        };
      }),
    );
    if (!result) throw new Error("Category update did not complete.");
    return result;
  }

  async archive(
    context: TenantContext,
    untrustedInput: ArchiveCategoryInput,
  ): Promise<{ version: number; alreadyArchived: boolean }> {
    requirePermission(context.permissions, "product:archive");
    const input = archiveCategorySchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const categories =
          database.collection<MutableCategoryDocument>("categories");
        const existing = await categories.findOne(
          {
            _id: input.categoryId,
            tenantId: context.tenantId,
            deletedAt: { $exists: false },
          },
          { session },
        );
        if (!existing) throw new CategoryNotFoundError();
        if (existing.status === "archived")
          return { version: existing.version, alreadyArchived: true };
        if (existing.version !== input.expectedVersion)
          throw new CategoryVersionConflictError();
        const productCount = await database
          .collection("products")
          .countDocuments(
            {
              tenantId: context.tenantId,
              category: existing.name,
              status: { $in: ["active", "draft"] },
              deletedAt: { $exists: false },
            },
            { session },
          );
        if (productCount > 0) throw new CategoryInUseError(productCount);

        const now = new Date();
        const archive = await categories.updateOne(
          {
            _id: input.categoryId,
            tenantId: context.tenantId,
            version: input.expectedVersion,
            status: "active",
            deletedAt: { $exists: false },
          },
          {
            $set: {
              status: "archived",
              archivedAt: now,
              archivedBy: context.userId,
              updatedAt: now,
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (archive.matchedCount !== 1)
          throw new CategoryVersionConflictError();
        await database.collection<StringIdDocument>("auditLogs").insertOne(
          {
            _id: createOpaqueId("aud"),
            tenantId: context.tenantId,
            actorId: context.userId,
            action: "category.archived",
            entityType: "category",
            entityId: input.categoryId,
            requestId: context.requestId,
            summary: "Archived an unassigned catalog category.",
            changes: {
              before: { status: existing.status },
              after: { status: "archived" },
            },
            createdAt: now,
          },
          { session },
        );
        return {
          version: input.expectedVersion + 1,
          alreadyArchived: false,
        };
      }),
    );
    if (!result) throw new Error("Category archive did not complete.");
    return result;
  }
}
