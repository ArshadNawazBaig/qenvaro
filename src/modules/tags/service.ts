import "server-only";
import type { ClientSession, Db } from "mongodb";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import { requireTenantWriteEntitlement } from "@/modules/billing/entitlements";
import { requirePermission } from "@/modules/permissions/permissions";
import {
  archiveTagSchema,
  createTagSchema,
  createTagSlug,
  normalizeTagName,
  updateTagSchema,
  type ArchiveTagInput,
  type CreateTagInput,
  type TagColor,
  type UpdateTagInput,
} from "@/modules/tags/schemas";
import { getMongoClient } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

type StringIdDocument = { _id: string } & Record<string, unknown>;

interface MutableTagDocument {
  _id: string;
  tenantId: string;
  name: string;
  normalizedName: string;
  slug: string;
  description: string;
  color: TagColor;
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

export class TagNotFoundError extends Error {
  constructor() {
    super("The requested tag was not found.");
    this.name = "TagNotFoundError";
  }
}

export class TagVersionConflictError extends Error {
  constructor() {
    super("This tag changed after the page was loaded.");
    this.name = "TagVersionConflictError";
  }
}

export class TagArchivedError extends Error {
  constructor() {
    super("Archived tags cannot be edited.");
    this.name = "TagArchivedError";
  }
}

export class TagDuplicateError extends Error {
  constructor() {
    super("A tag with that name already exists.");
    this.name = "TagDuplicateError";
  }
}

export class TagInUseError extends Error {
  constructor(public readonly productCount: number) {
    super("Assigned tags cannot be archived.");
    this.name = "TagInUseError";
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
  if (!profile) throw new TagNotFoundError();
  requireTenantWriteEntitlement(profile);
}

export class TagService {
  async create(
    context: TenantContext,
    untrustedInput: CreateTagInput,
  ): Promise<{ id: string; version: number }> {
    requirePermission(context.permissions, "product:create");
    const input = createTagSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const tagId = createOpaqueId("tag");
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const tags = database.collection<MutableTagDocument>("tags");
        const normalizedName = normalizeTagName(input.name);
        const duplicate = await tags.findOne(
          {
            tenantId: context.tenantId,
            normalizedName,
            deletedAt: { $exists: false },
          },
          { session, projection: { _id: 1 } },
        );
        if (duplicate) throw new TagDuplicateError();
        const now = new Date();
        await tags.insertOne(
          {
            _id: tagId,
            tenantId: context.tenantId,
            name: input.name,
            normalizedName,
            slug: createTagSlug(input.name, tagId),
            description: input.description,
            color: input.color,
            status: "active",
            version: 1,
            createdAt: now,
            updatedAt: now,
            createdBy: context.userId,
            updatedBy: context.userId,
          } as MutableTagDocument,
          { session },
        );
        await database.collection<StringIdDocument>("auditLogs").insertOne(
          {
            _id: createOpaqueId("aud"),
            tenantId: context.tenantId,
            actorId: context.userId,
            action: "tag.created",
            entityType: "tag",
            entityId: tagId,
            requestId: context.requestId,
            summary: "Created a catalog tag.",
            changes: {
              after: {
                name: input.name,
                color: input.color,
                status: "active",
              },
            },
            createdAt: now,
          },
          { session },
        );
        return { id: tagId, version: 1 };
      }),
    );
    if (!result) throw new Error("Tag creation did not complete.");
    return result;
  }

  async update(
    context: TenantContext,
    untrustedInput: UpdateTagInput,
  ): Promise<{ version: number }> {
    requirePermission(context.permissions, "product:update");
    const input = updateTagSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const tags = database.collection<MutableTagDocument>("tags");
        const existing = await tags.findOne(
          {
            _id: input.tagId,
            tenantId: context.tenantId,
            deletedAt: { $exists: false },
          },
          { session },
        );
        if (!existing) throw new TagNotFoundError();
        if (existing.status === "archived") throw new TagArchivedError();
        if (existing.version !== input.expectedVersion)
          throw new TagVersionConflictError();
        const normalizedName = normalizeTagName(input.name);
        if (normalizedName !== existing.normalizedName) {
          const duplicate = await tags.findOne(
            {
              tenantId: context.tenantId,
              normalizedName,
              _id: { $ne: input.tagId },
              deletedAt: { $exists: false },
            },
            { session, projection: { _id: 1 } },
          );
          if (duplicate) throw new TagDuplicateError();
        }
        const now = new Date();
        const update = await tags.updateOne(
          {
            _id: input.tagId,
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
              color: input.color,
              updatedAt: now,
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1) throw new TagVersionConflictError();
        await database.collection<StringIdDocument>("auditLogs").insertOne(
          {
            _id: createOpaqueId("aud"),
            tenantId: context.tenantId,
            actorId: context.userId,
            action: "tag.updated",
            entityType: "tag",
            entityId: input.tagId,
            requestId: context.requestId,
            summary: "Updated a catalog tag.",
            changes: {
              before: {
                name: existing.name,
                description: existing.description,
                color: existing.color,
              },
              after: {
                name: input.name,
                description: input.description,
                color: input.color,
              },
            },
            createdAt: now,
          },
          { session },
        );
        return { version: input.expectedVersion + 1 };
      }),
    );
    if (!result) throw new Error("Tag update did not complete.");
    return result;
  }

  async archive(
    context: TenantContext,
    untrustedInput: ArchiveTagInput,
  ): Promise<{ version: number; alreadyArchived: boolean }> {
    requirePermission(context.permissions, "product:archive");
    const input = archiveTagSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const tags = database.collection<MutableTagDocument>("tags");
        const existing = await tags.findOne(
          {
            _id: input.tagId,
            tenantId: context.tenantId,
            deletedAt: { $exists: false },
          },
          { session },
        );
        if (!existing) throw new TagNotFoundError();
        if (existing.status === "archived")
          return { version: existing.version, alreadyArchived: true };
        if (existing.version !== input.expectedVersion)
          throw new TagVersionConflictError();
        const productCount = await database
          .collection("products")
          .countDocuments(
            {
              tenantId: context.tenantId,
              tagIds: input.tagId,
              status: { $in: ["active", "draft"] },
              deletedAt: { $exists: false },
            },
            { session },
          );
        if (productCount > 0) throw new TagInUseError(productCount);
        const now = new Date();
        const archive = await tags.updateOne(
          {
            _id: input.tagId,
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
        if (archive.matchedCount !== 1) throw new TagVersionConflictError();
        await database.collection<StringIdDocument>("auditLogs").insertOne(
          {
            _id: createOpaqueId("aud"),
            tenantId: context.tenantId,
            actorId: context.userId,
            action: "tag.archived",
            entityType: "tag",
            entityId: input.tagId,
            requestId: context.requestId,
            summary: "Archived an unassigned catalog tag.",
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
    if (!result) throw new Error("Tag archive did not complete.");
    return result;
  }
}
