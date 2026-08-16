import "server-only";
import type { ClientSession, Db } from "mongodb";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import { requireTenantWriteEntitlement } from "@/modules/billing/entitlements";
import { requirePermission } from "@/modules/permissions/permissions";
import {
  archiveUnitSchema,
  createUnitSchema,
  createUnitSlug,
  normalizeUnitValue,
  updateUnitSchema,
  type ArchiveUnitInput,
  type CreateUnitInput,
  type UpdateUnitInput,
} from "@/modules/units/schemas";
import { getMongoClient } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

type StringIdDocument = { _id: string } & Record<string, unknown>;

interface MutableUnitDocument {
  _id: string;
  tenantId: string;
  name: string;
  normalizedName: string;
  symbol: string;
  normalizedSymbol: string;
  slug: string;
  description: string;
  status: "active" | "archived";
  isDefault: boolean;
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

export class UnitNotFoundError extends Error {
  constructor() {
    super("The requested unit was not found.");
    this.name = "UnitNotFoundError";
  }
}

export class UnitVersionConflictError extends Error {
  constructor() {
    super("This unit changed after the page was loaded.");
    this.name = "UnitVersionConflictError";
  }
}

export class UnitArchivedError extends Error {
  constructor() {
    super("Archived units cannot be edited.");
    this.name = "UnitArchivedError";
  }
}

export class UnitDuplicateError extends Error {
  constructor(public readonly field: "name" | "symbol") {
    super(`A unit with that ${field} already exists.`);
    this.name = "UnitDuplicateError";
  }
}

export class UnitInUseError extends Error {
  constructor(public readonly productCount: number) {
    super("Assigned units cannot be archived.");
    this.name = "UnitInUseError";
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
  if (!profile) throw new UnitNotFoundError();
  requireTenantWriteEntitlement(profile);
}

async function findDuplicate(
  database: Db,
  session: ClientSession,
  tenantId: string,
  normalizedName: string,
  normalizedSymbol: string,
  excludeUnitId?: string,
): Promise<"name" | "symbol" | null> {
  const duplicate = await database
    .collection<MutableUnitDocument>("units")
    .findOne(
      {
        tenantId,
        ...(excludeUnitId ? { _id: { $ne: excludeUnitId } } : {}),
        deletedAt: { $exists: false },
        $or: [{ normalizedName }, { normalizedSymbol }],
      },
      { session, projection: { normalizedName: 1, normalizedSymbol: 1 } },
    );
  if (!duplicate) return null;
  return duplicate.normalizedName === normalizedName ? "name" : "symbol";
}

export async function ensureDefaultUnit(
  database: Db,
  session: ClientSession,
  context: Pick<TenantContext, "tenantId" | "userId" | "requestId">,
  now: Date,
): Promise<string> {
  const units = database.collection<MutableUnitDocument>("units");
  const active = await units.findOne(
    {
      tenantId: context.tenantId,
      status: "active",
      deletedAt: { $exists: false },
    },
    { session, sort: { isDefault: -1, createdAt: 1 }, projection: { _id: 1 } },
  );
  if (active) return active._id;

  const unitId = createOpaqueId("uom");
  await units.insertOne(
    {
      _id: unitId,
      tenantId: context.tenantId,
      name: "Each",
      normalizedName: "each",
      symbol: "ea",
      normalizedSymbol: "ea",
      slug: createUnitSlug("Each", unitId),
      description: "Default unit for individually counted products.",
      status: "active",
      isDefault: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: context.userId,
      updatedBy: context.userId,
    } as MutableUnitDocument,
    { session },
  );
  await database.collection<StringIdDocument>("auditLogs").insertOne(
    {
      _id: createOpaqueId("aud"),
      tenantId: context.tenantId,
      actorId: context.userId,
      action: "unit.created",
      entityType: "unit",
      entityId: unitId,
      requestId: context.requestId,
      summary: "Created the default catalog unit.",
      changes: {
        after: { name: "Each", symbol: "ea", status: "active" },
      },
      createdAt: now,
    },
    { session },
  );
  return unitId;
}

export class UnitService {
  async create(
    context: TenantContext,
    untrustedInput: CreateUnitInput,
  ): Promise<{ id: string; version: number }> {
    requirePermission(context.permissions, "product:create");
    const input = createUnitSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const unitId = createOpaqueId("uom");
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const normalizedName = normalizeUnitValue(input.name);
        const normalizedSymbol = normalizeUnitValue(input.symbol);
        const duplicateField = await findDuplicate(
          database,
          session,
          context.tenantId,
          normalizedName,
          normalizedSymbol,
        );
        if (duplicateField) throw new UnitDuplicateError(duplicateField);
        const now = new Date();
        await database.collection<MutableUnitDocument>("units").insertOne(
          {
            _id: unitId,
            tenantId: context.tenantId,
            name: input.name,
            normalizedName,
            symbol: input.symbol,
            normalizedSymbol,
            slug: createUnitSlug(input.name, unitId),
            description: input.description,
            status: "active",
            isDefault: false,
            version: 1,
            createdAt: now,
            updatedAt: now,
            createdBy: context.userId,
            updatedBy: context.userId,
          } as MutableUnitDocument,
          { session },
        );
        await database.collection<StringIdDocument>("auditLogs").insertOne(
          {
            _id: createOpaqueId("aud"),
            tenantId: context.tenantId,
            actorId: context.userId,
            action: "unit.created",
            entityType: "unit",
            entityId: unitId,
            requestId: context.requestId,
            summary: "Created a catalog unit.",
            changes: {
              after: {
                name: input.name,
                symbol: input.symbol,
                status: "active",
              },
            },
            createdAt: now,
          },
          { session },
        );
        return { id: unitId, version: 1 };
      }),
    );
    if (!result) throw new Error("Unit creation did not complete.");
    return result;
  }

  async update(
    context: TenantContext,
    untrustedInput: UpdateUnitInput,
  ): Promise<{ version: number }> {
    requirePermission(context.permissions, "product:update");
    const input = updateUnitSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const units = database.collection<MutableUnitDocument>("units");
        const existing = await units.findOne(
          {
            _id: input.unitId,
            tenantId: context.tenantId,
            deletedAt: { $exists: false },
          },
          { session },
        );
        if (!existing) throw new UnitNotFoundError();
        if (existing.status === "archived") throw new UnitArchivedError();
        if (existing.version !== input.expectedVersion)
          throw new UnitVersionConflictError();
        const normalizedName = normalizeUnitValue(input.name);
        const normalizedSymbol = normalizeUnitValue(input.symbol);
        const duplicateField = await findDuplicate(
          database,
          session,
          context.tenantId,
          normalizedName,
          normalizedSymbol,
          input.unitId,
        );
        if (duplicateField) throw new UnitDuplicateError(duplicateField);
        const now = new Date();
        const update = await units.updateOne(
          {
            _id: input.unitId,
            tenantId: context.tenantId,
            version: input.expectedVersion,
            status: "active",
            deletedAt: { $exists: false },
          },
          {
            $set: {
              name: input.name,
              normalizedName,
              symbol: input.symbol,
              normalizedSymbol,
              description: input.description,
              updatedAt: now,
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1) throw new UnitVersionConflictError();
        await database.collection<StringIdDocument>("auditLogs").insertOne(
          {
            _id: createOpaqueId("aud"),
            tenantId: context.tenantId,
            actorId: context.userId,
            action: "unit.updated",
            entityType: "unit",
            entityId: input.unitId,
            requestId: context.requestId,
            summary: "Updated a catalog unit.",
            changes: {
              before: {
                name: existing.name,
                symbol: existing.symbol,
                description: existing.description,
              },
              after: input,
            },
            createdAt: now,
          },
          { session },
        );
        return { version: input.expectedVersion + 1 };
      }),
    );
    if (!result) throw new Error("Unit update did not complete.");
    return result;
  }

  async archive(
    context: TenantContext,
    untrustedInput: ArchiveUnitInput,
  ): Promise<{ version: number; alreadyArchived: boolean }> {
    requirePermission(context.permissions, "product:archive");
    const input = archiveUnitSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const units = database.collection<MutableUnitDocument>("units");
        const existing = await units.findOne(
          {
            _id: input.unitId,
            tenantId: context.tenantId,
            deletedAt: { $exists: false },
          },
          { session },
        );
        if (!existing) throw new UnitNotFoundError();
        if (existing.status === "archived")
          return { version: existing.version, alreadyArchived: true };
        if (existing.version !== input.expectedVersion)
          throw new UnitVersionConflictError();
        const productCount = await database
          .collection("products")
          .countDocuments(
            {
              tenantId: context.tenantId,
              unitId: input.unitId,
              status: { $in: ["active", "draft"] },
              deletedAt: { $exists: false },
            },
            { session },
          );
        if (productCount > 0) throw new UnitInUseError(productCount);
        const now = new Date();
        const archive = await units.updateOne(
          {
            _id: input.unitId,
            tenantId: context.tenantId,
            version: input.expectedVersion,
            status: "active",
            deletedAt: { $exists: false },
          },
          {
            $set: {
              status: "archived",
              isDefault: false,
              archivedAt: now,
              archivedBy: context.userId,
              updatedAt: now,
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (archive.matchedCount !== 1) throw new UnitVersionConflictError();
        await database.collection<StringIdDocument>("auditLogs").insertOne(
          {
            _id: createOpaqueId("aud"),
            tenantId: context.tenantId,
            actorId: context.userId,
            action: "unit.archived",
            entityType: "unit",
            entityId: input.unitId,
            requestId: context.requestId,
            summary: "Archived an unassigned catalog unit.",
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
    if (!result) throw new Error("Unit archive did not complete.");
    return result;
  }
}
