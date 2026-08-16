import "server-only";
import type { ClientSession, Db } from "mongodb";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import { requireTenantWriteEntitlement } from "@/modules/billing/entitlements";
import {
  archiveCustomerSchema,
  createCustomerCode,
  createCustomerSchema,
  normalizeCustomerPhone,
  normalizeCustomerValue,
  updateCustomerSchema,
  type ArchiveCustomerInput,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from "@/modules/customers/schemas";
import { requirePermission } from "@/modules/permissions/permissions";
import { getMongoClient } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

type StringIdDocument = { _id: string } & Record<string, unknown>;

interface MutableCustomerDocument {
  _id: string;
  tenantId: string;
  code: string;
  name: string;
  normalizedName: string;
  company: string;
  email: string;
  normalizedEmail: string;
  phone: string;
  normalizedPhone: string;
  address: CreateCustomerInput["address"];
  notes: string;
  status: "active" | "archived";
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt?: Date;
}

interface TenantBillingProfile {
  planKey: string;
  billingStatus?: string;
  trialEndsAt?: Date;
  graceEndsAt?: Date;
  currentPeriodEndsAt?: Date;
}

export class CustomerNotFoundError extends Error {
  constructor() {
    super("The requested customer was not found.");
    this.name = "CustomerNotFoundError";
  }
}

export class CustomerVersionConflictError extends Error {
  constructor() {
    super("This customer changed after the page was loaded.");
    this.name = "CustomerVersionConflictError";
  }
}

export class CustomerArchivedError extends Error {
  constructor() {
    super("Archived customers cannot be edited.");
    this.name = "CustomerArchivedError";
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
  if (!profile) throw new CustomerNotFoundError();
  requireTenantWriteEntitlement(profile);
}

function contactMethods(
  customer: Pick<CreateCustomerInput, "email" | "phone">,
) {
  return [
    customer.email ? "email" : null,
    customer.phone ? "phone" : null,
  ].filter((value): value is string => value !== null);
}

function mutableFields(input: CreateCustomerInput) {
  return {
    name: input.name,
    normalizedName: normalizeCustomerValue(input.name),
    company: input.company,
    email: input.email,
    normalizedEmail: normalizeCustomerValue(input.email),
    phone: input.phone,
    normalizedPhone: normalizeCustomerPhone(input.phone),
    address: input.address,
    notes: input.notes,
  };
}

export class CustomerService {
  async create(
    context: TenantContext,
    untrustedInput: CreateCustomerInput,
  ): Promise<{ id: string; code: string; version: number }> {
    requirePermission(context.permissions, "customer:create");
    const input = createCustomerSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const customerId = createOpaqueId("cus");
    const code = createCustomerCode(customerId);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const now = new Date();
        await database
          .collection<MutableCustomerDocument>("customers")
          .insertOne(
            {
              _id: customerId,
              tenantId: context.tenantId,
              code,
              ...mutableFields(input),
              status: "active",
              version: 1,
              createdAt: now,
              updatedAt: now,
              createdBy: context.userId,
              updatedBy: context.userId,
            },
            { session },
          );
        await database.collection<StringIdDocument>("auditLogs").insertOne(
          {
            _id: createOpaqueId("aud"),
            tenantId: context.tenantId,
            actorId: context.userId,
            action: "customer.created",
            entityType: "customer",
            entityId: customerId,
            requestId: context.requestId,
            summary: "Created a customer profile.",
            changes: {
              after: {
                code,
                status: "active",
                contactMethods: contactMethods(input),
                hasCompany: Boolean(input.company),
              },
            },
            createdAt: now,
          },
          { session },
        );
        return { id: customerId, code, version: 1 };
      }),
    );
    if (!result) throw new Error("Customer creation did not complete.");
    return result;
  }

  async update(
    context: TenantContext,
    untrustedInput: UpdateCustomerInput,
  ): Promise<{ version: number }> {
    requirePermission(context.permissions, "customer:update");
    const input = updateCustomerSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const customers =
          database.collection<MutableCustomerDocument>("customers");
        const existing = await customers.findOne(
          {
            _id: input.customerId,
            tenantId: context.tenantId,
            deletedAt: { $exists: false },
          },
          { session },
        );
        if (!existing) throw new CustomerNotFoundError();
        if (existing.status === "archived") throw new CustomerArchivedError();
        if (existing.version !== input.expectedVersion)
          throw new CustomerVersionConflictError();
        const now = new Date();
        const update = await customers.updateOne(
          {
            _id: input.customerId,
            tenantId: context.tenantId,
            version: input.expectedVersion,
            status: "active",
            deletedAt: { $exists: false },
          },
          {
            $set: {
              ...mutableFields(input),
              updatedAt: now,
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1) throw new CustomerVersionConflictError();
        await database.collection<StringIdDocument>("auditLogs").insertOne(
          {
            _id: createOpaqueId("aud"),
            tenantId: context.tenantId,
            actorId: context.userId,
            action: "customer.updated",
            entityType: "customer",
            entityId: input.customerId,
            requestId: context.requestId,
            summary: "Updated a customer profile.",
            changes: {
              before: {
                status: existing.status,
                contactMethods: contactMethods(existing),
                hasCompany: Boolean(existing.company),
              },
              after: {
                status: "active",
                contactMethods: contactMethods(input),
                hasCompany: Boolean(input.company),
              },
            },
            createdAt: now,
          },
          { session },
        );
        return { version: input.expectedVersion + 1 };
      }),
    );
    if (!result) throw new Error("Customer update did not complete.");
    return result;
  }

  async archive(
    context: TenantContext,
    untrustedInput: ArchiveCustomerInput,
  ): Promise<{ version: number; alreadyArchived: boolean }> {
    requirePermission(context.permissions, "customer:archive");
    const input = archiveCustomerSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const customers =
          database.collection<MutableCustomerDocument>("customers");
        const existing = await customers.findOne(
          {
            _id: input.customerId,
            tenantId: context.tenantId,
            deletedAt: { $exists: false },
          },
          { session },
        );
        if (!existing) throw new CustomerNotFoundError();
        if (existing.status === "archived")
          return { version: existing.version, alreadyArchived: true };
        if (existing.version !== input.expectedVersion)
          throw new CustomerVersionConflictError();
        const now = new Date();
        const archive = await customers.updateOne(
          {
            _id: input.customerId,
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
          throw new CustomerVersionConflictError();
        await database.collection<StringIdDocument>("auditLogs").insertOne(
          {
            _id: createOpaqueId("aud"),
            tenantId: context.tenantId,
            actorId: context.userId,
            action: "customer.archived",
            entityType: "customer",
            entityId: input.customerId,
            requestId: context.requestId,
            summary: "Archived a customer profile.",
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
    if (!result) throw new Error("Customer archive did not complete.");
    return result;
  }
}
