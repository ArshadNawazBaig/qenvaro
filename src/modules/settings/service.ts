import "server-only";
import type { ClientSession, Db } from "mongodb";
import { assertUsageAvailable, planKeySchema, plans } from "@/config/plans";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import { requireTenantWriteEntitlement } from "@/modules/billing/entitlements";
import { requirePermission } from "@/modules/permissions/permissions";
import {
  archiveStoreSchema,
  businessSettingsSchema,
  createStoreSchema,
  dataRequestSchema,
  operationSettingsSchema,
  updateStoreSchema,
  type ArchiveStoreInput,
  type BusinessSettingsInput,
  type CreateStoreInput,
  type DataRequestInput,
  type OperationSettingsInput,
  type UpdateStoreInput,
} from "./schemas";
import { getMongoClient } from "@/server/db/client";
import {
  TenantNotFoundError,
  type TenantContext,
} from "@/server/tenancy/context";

type StringIdDocument = { _id: string } & Record<string, unknown>;
interface UsageCounterDocument {
  _id: string;
  tenantId: string;
  resource: string;
  value: number;
  updatedAt?: Date;
}

interface ProfileDocument {
  _id: string;
  tenantId: string;
  businessName: string;
  legalName?: string;
  supportEmail?: string;
  phone?: string;
  address?: string;
  locale: string;
  timezone: string;
  currency: string;
  planKey: string;
  billingStatus?: string;
  trialEndsAt?: Date;
  graceEndsAt?: Date;
  currentPeriodEndsAt?: Date;
  inventorySettings?: { allowNegativeStock?: boolean };
  operationSettings?: {
    defaultTaxRateBps?: number;
    pricesIncludeTax?: boolean;
    receiptPrefix?: string;
    returnPrefix?: string;
    purchasePrefix?: string;
    expensePrefix?: string;
    version?: number;
  };
  version: number;
}

interface StoreDocument {
  _id: string;
  tenantId: string;
  name: string;
  code: string;
  timezone: string;
  address: string;
  status: "active" | "archived";
  version: number;
  createdAt: Date;
}

export class SettingsConflictError extends Error {
  constructor(message = "These settings changed after the page was loaded.") {
    super(message);
    this.name = "SettingsConflictError";
  }
}

export class SettingsDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsDomainError";
  }
}

async function requireWriteProfile(
  database: Db,
  context: TenantContext,
  session: ClientSession,
) {
  const profile = await database
    .collection<ProfileDocument>("tenantProfiles")
    .findOne({ tenantId: context.tenantId }, { session });
  if (!profile) throw new TenantNotFoundError();
  requireTenantWriteEntitlement(profile);
  return profile;
}

async function audit(
  database: Db,
  context: TenantContext,
  session: ClientSession,
  input: {
    action: string;
    entityType: string;
    entityId: string;
    summary: string;
    changes?: Record<string, unknown>;
  },
) {
  await database.collection<StringIdDocument>("auditLogs").insertOne(
    {
      _id: createOpaqueId("aud"),
      tenantId: context.tenantId,
      actorId: context.userId,
      requestId: context.requestId,
      ...input,
      createdAt: new Date(),
    },
    { session },
  );
}

async function updateCatalogCurrency(
  database: Db,
  context: TenantContext,
  session: ClientSession,
  currency: string,
) {
  const financialCollections = [
    "sales",
    "returns",
    "purchaseOrders",
    "expenses",
    "payrollRuns",
  ] as const;
  const existingFinancialRecord = await Promise.all(
    financialCollections.map((collection) =>
      database
        .collection(collection)
        .findOne(
          { tenantId: context.tenantId },
          { projection: { _id: 1 }, session },
        ),
    ),
  );
  if (existingFinancialRecord.some(Boolean))
    throw new SettingsDomainError(
      "Currency cannot be changed after financial transactions exist. A controlled currency migration is required.",
    );

  await Promise.all([
    database
      .collection("products")
      .updateMany(
        { tenantId: context.tenantId },
        { $set: { currency, updatedAt: new Date() } },
        { session },
      ),
    database
      .collection("productVariants")
      .updateMany(
        { tenantId: context.tenantId },
        { $set: { currency, updatedAt: new Date() } },
        { session },
      ),
  ]);
}

async function incrementStoreUsage(
  database: Db,
  session: ClientSession,
  context: TenantContext,
  planKey: string,
  currentUsage: number,
) {
  const plan = planKeySchema.parse(planKey);
  assertUsageAvailable(plan, "stores", currentUsage);
  const id = `${context.tenantId}:stores`;
  await database
    .collection<{ _id: string; value: number }>("usageCounters")
    .updateOne(
      { _id: id },
      {
        $setOnInsert: {
          tenantId: context.tenantId,
          resource: "stores",
          value: currentUsage,
          createdAt: new Date(),
        },
        $set: { reconciledAt: new Date() },
      },
      { session, upsert: true },
    );
  const limit = plans[plan].limits.stores;
  const counter = await database
    .collection<{ _id: string; value: number }>("usageCounters")
    .findOneAndUpdate(
      { _id: id, ...(limit === null ? {} : { value: { $lt: limit } }) },
      { $inc: { value: 1 }, $set: { updatedAt: new Date() } },
      { session, returnDocument: "after" },
    );
  if (!counter) assertUsageAvailable(plan, "stores", currentUsage);
}

export class TenantSettingsService {
  async updateBusiness(
    context: TenantContext,
    untrusted: BusinessSettingsInput,
  ) {
    requirePermission(context.permissions, "tenant:update");
    const input = businessSettingsSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        const profile = await requireWriteProfile(database, context, session);
        if ((profile.version ?? 1) !== input.expectedVersion)
          throw new SettingsConflictError();
        if (profile.currency !== input.currency)
          await updateCatalogCurrency(
            database,
            context,
            session,
            input.currency,
          );
        const update = await database
          .collection<ProfileDocument>("tenantProfiles")
          .updateOne(
            { tenantId: context.tenantId, version: input.expectedVersion },
            {
              $set: {
                businessName: input.businessName,
                legalName: input.legalName,
                supportEmail: input.supportEmail,
                phone: input.phone,
                address: input.address,
                locale: input.locale,
                timezone: input.timezone,
                currency: input.currency,
                updatedAt: new Date(),
                updatedBy: context.userId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
        if (update.matchedCount !== 1) throw new SettingsConflictError();
        await database
          .collection<StringIdDocument>("organization")
          .updateOne(
            { _id: context.tenantId },
            { $set: { name: input.businessName } },
            { session },
          );
        await audit(database, context, session, {
          action: "tenant.settings_updated",
          entityType: "tenant",
          entityId: context.tenantId,
          summary: "Updated business and regional settings.",
          changes: {
            before: {
              currency: profile.currency,
              locale: profile.locale,
              timezone: profile.timezone,
            },
            after: {
              currency: input.currency,
              locale: input.locale,
              timezone: input.timezone,
            },
          },
        });
        return { version: input.expectedVersion + 1 };
      }),
    );
    if (!result) throw new Error("Business settings update did not complete.");
    return result;
  }

  async updateOperations(
    context: TenantContext,
    untrusted: OperationSettingsInput,
  ) {
    requirePermission(context.permissions, "settings:manage");
    const input = operationSettingsSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        const profile = await requireWriteProfile(database, context, session);
        const currentVersion = profile.operationSettings?.version ?? 1;
        if (currentVersion !== input.expectedVersion)
          throw new SettingsConflictError();
        const next = {
          defaultTaxRateBps: input.defaultTaxRateBps,
          pricesIncludeTax: input.pricesIncludeTax,
          receiptPrefix: input.receiptPrefix.toUpperCase(),
          returnPrefix: input.returnPrefix.toUpperCase(),
          purchasePrefix: input.purchasePrefix.toUpperCase(),
          expensePrefix: input.expensePrefix.toUpperCase(),
          version: currentVersion + 1,
        };
        const update = await database
          .collection<ProfileDocument>("tenantProfiles")
          .updateOne(
            {
              tenantId: context.tenantId,
              "operationSettings.version": profile.operationSettings
                ?.version ?? { $exists: false },
            },
            {
              $set: {
                operationSettings: next,
                "inventorySettings.allowNegativeStock":
                  input.allowNegativeStock,
                updatedAt: new Date(),
                updatedBy: context.userId,
              },
            },
            { session },
          );
        if (update.matchedCount !== 1) throw new SettingsConflictError();
        const now = new Date();
        await database.collection<StringIdDocument>("taxRates").updateOne(
          {
            tenantId: context.tenantId,
            isDefault: true,
            status: "active",
          },
          {
            $set: {
              name: "Standard",
              normalizedName: "standard",
              rateBps: input.defaultTaxRateBps,
              pricesIncludeTax: input.pricesIncludeTax,
              updatedAt: now,
              updatedBy: context.userId,
            },
            $setOnInsert: {
              _id: createOpaqueId("tax"),
              tenantId: context.tenantId,
              isDefault: true,
              status: "active",
              createdAt: now,
              createdBy: context.userId,
              version: 1,
            },
          },
          { session, upsert: true },
        );
        await audit(database, context, session, {
          action: "tenant.operations_settings_updated",
          entityType: "tenant",
          entityId: context.tenantId,
          summary: "Updated tax, numbering, and inventory policies.",
          changes: {
            before: {
              allowNegativeStock:
                profile.inventorySettings?.allowNegativeStock === true,
              version: currentVersion,
            },
            after: {
              allowNegativeStock: input.allowNegativeStock,
              defaultTaxRateBps: input.defaultTaxRateBps,
              pricesIncludeTax: input.pricesIncludeTax,
              version: currentVersion + 1,
            },
          },
        });
        return { version: currentVersion + 1 };
      }),
    );
    if (!result) throw new Error("Operation settings update did not complete.");
    return result;
  }

  async createStore(context: TenantContext, untrusted: CreateStoreInput) {
    requirePermission(context.permissions, "store:create");
    const input = createStoreSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        const profile = await requireWriteProfile(database, context, session);
        const currentUsage = await database.collection("stores").countDocuments(
          {
            tenantId: context.tenantId,
            status: "active",
            deletedAt: { $exists: false },
          },
          { session },
        );
        await incrementStoreUsage(
          database,
          session,
          context,
          profile.planKey,
          currentUsage,
        );
        const id = createOpaqueId("store");
        const now = new Date();
        await database.collection<StoreDocument>("stores").insertOne(
          {
            _id: id,
            tenantId: context.tenantId,
            name: input.name,
            code: input.code,
            timezone: input.timezone,
            address: input.address,
            status: "active",
            version: 1,
            createdAt: now,
          } as StoreDocument,
          { session },
        );
        await database
          .collection<StringIdDocument>("memberStoreAssignments")
          .updateOne(
            {
              tenantId: context.tenantId,
              membershipId: context.membershipId,
              storeId: id,
            },
            {
              $setOnInsert: {
                _id: createOpaqueId("msa"),
                tenantId: context.tenantId,
                membershipId: context.membershipId,
                storeId: id,
                createdAt: now,
                createdBy: context.userId,
              },
            },
            { session, upsert: true },
          );
        await audit(database, context, session, {
          action: "store.created",
          entityType: "store",
          entityId: id,
          summary: "Created a business store.",
          changes: { after: { code: input.code, status: "active" } },
        });
        return { id, version: 1 };
      }),
    );
    if (!result) throw new Error("Store creation did not complete.");
    return result;
  }

  async updateStore(context: TenantContext, untrusted: UpdateStoreInput) {
    requirePermission(context.permissions, "store:update");
    const input = updateStoreSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteProfile(database, context, session);
        const store = await database
          .collection<StoreDocument>("stores")
          .findOne(
            { _id: input.storeId, tenantId: context.tenantId },
            { session },
          );
        if (!store) throw new TenantNotFoundError();
        if (store.status === "archived")
          throw new SettingsDomainError("Archived stores cannot be edited.");
        if (store.version !== input.expectedVersion)
          throw new SettingsConflictError();
        const update = await database
          .collection<StoreDocument>("stores")
          .updateOne(
            {
              _id: input.storeId,
              tenantId: context.tenantId,
              version: input.expectedVersion,
            },
            {
              $set: {
                name: input.name,
                code: input.code,
                timezone: input.timezone,
                address: input.address,
                updatedAt: new Date(),
                updatedBy: context.userId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
        if (update.matchedCount !== 1) throw new SettingsConflictError();
        await audit(database, context, session, {
          action: "store.updated",
          entityType: "store",
          entityId: input.storeId,
          summary: "Updated a business store.",
          changes: {
            before: { code: store.code, status: store.status },
            after: { code: input.code, status: store.status },
          },
        });
        return { version: input.expectedVersion + 1 };
      }),
    );
    if (!result) throw new Error("Store update did not complete.");
    return result;
  }

  async archiveStore(context: TenantContext, untrusted: ArchiveStoreInput) {
    requirePermission(context.permissions, "store:archive");
    const input = archiveStoreSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteProfile(database, context, session);
        const store = await database
          .collection<StoreDocument>("stores")
          .findOne(
            { _id: input.storeId, tenantId: context.tenantId },
            { session },
          );
        if (!store) throw new TenantNotFoundError();
        if (store.status === "archived")
          return { version: store.version, unchanged: true };
        if (store.version !== input.expectedVersion)
          throw new SettingsConflictError();
        const activeCount = await database.collection("stores").countDocuments(
          {
            tenantId: context.tenantId,
            status: "active",
            deletedAt: { $exists: false },
          },
          { session },
        );
        const stockCount = await database
          .collection("inventoryLevels")
          .countDocuments(
            {
              tenantId: context.tenantId,
              storeId: input.storeId,
              quantity: { $ne: 0 },
            },
            { session },
          );
        const openPurchases = await database
          .collection("purchaseOrders")
          .countDocuments(
            {
              tenantId: context.tenantId,
              storeId: input.storeId,
              status: {
                $in: ["draft", "submitted", "approved", "partially_received"],
              },
            },
            { session },
          );
        if (activeCount <= 1)
          throw new SettingsDomainError(
            "The final active store cannot be archived.",
          );
        if (stockCount > 0)
          throw new SettingsDomainError(
            "Move or adjust all inventory to zero before archiving this store.",
          );
        if (openPurchases > 0)
          throw new SettingsDomainError(
            "Complete or cancel open purchase orders before archiving this store.",
          );
        const update = await database
          .collection<StoreDocument>("stores")
          .updateOne(
            {
              _id: input.storeId,
              tenantId: context.tenantId,
              version: input.expectedVersion,
            },
            {
              $set: {
                status: "archived",
                archivedAt: new Date(),
                archivedBy: context.userId,
                updatedAt: new Date(),
                updatedBy: context.userId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
        if (update.matchedCount !== 1) throw new SettingsConflictError();
        await database
          .collection<UsageCounterDocument>("usageCounters")
          .updateOne(
            { _id: `${context.tenantId}:stores`, value: { $gt: 0 } },
            { $inc: { value: -1 }, $set: { updatedAt: new Date() } },
            { session },
          );
        await audit(database, context, session, {
          action: "store.archived",
          entityType: "store",
          entityId: input.storeId,
          summary: "Archived a business store after operational safeguards.",
          changes: {
            before: { status: "active" },
            after: { status: "archived" },
          },
        });
        return { version: input.expectedVersion + 1, unchanged: false };
      }),
    );
    if (!result) throw new Error("Store archive did not complete.");
    return result;
  }

  async requestDataOperation(
    context: TenantContext,
    untrusted: DataRequestInput,
  ) {
    requirePermission(
      context.permissions,
      untrusted.type === "deletion" ? "tenant:delete" : "settings:manage",
    );
    const input = dataRequestSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteProfile(database, context, session);
        const existing = await database
          .collection("tenantDataRequests")
          .findOne(
            {
              tenantId: context.tenantId,
              type: input.type,
              status: { $in: ["requested", "reviewing"] },
            },
            { session, projection: { _id: 1 } },
          );
        if (existing)
          throw new SettingsDomainError(
            `A ${input.type} request is already pending.`,
          );
        const id = createOpaqueId("tdr");
        const now = new Date();
        await database
          .collection<StringIdDocument>("tenantDataRequests")
          .insertOne(
            {
              _id: id,
              tenantId: context.tenantId,
              type: input.type,
              status: "requested",
              requestedAt: now,
              requestedBy: context.userId,
              createdAt: now,
            },
            { session },
          );
        await audit(database, context, session, {
          action: `tenant.data_${input.type}_requested`,
          entityType: "tenantDataRequest",
          entityId: id,
          summary: `Requested a controlled tenant data ${input.type} workflow.`,
          changes: { after: { type: input.type, status: "requested" } },
        });
        return { id };
      }),
    );
    if (!result) throw new Error("Data request did not complete.");
    return result;
  }
}
