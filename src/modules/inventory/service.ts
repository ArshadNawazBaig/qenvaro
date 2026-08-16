import "server-only";
import type { ClientSession, Db } from "mongodb";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import { requireTenantWriteEntitlement } from "@/modules/billing/entitlements";
import {
  adjustmentDelta,
  adjustmentMovementType,
  effectiveStoreAvailability,
  mergeScopedStoreAvailability,
} from "@/modules/inventory/policy";
import {
  createStockAdjustmentSchema,
  createStockTransferSchema,
  updateLowStockAlertPreferencesSchema,
  updateProductAvailabilitySchema,
  type CreateStockAdjustmentInput,
  type CreateStockTransferInput,
  type InventoryMovementType,
  type UpdateLowStockAlertPreferencesInput,
  type UpdateProductAvailabilityInput,
} from "@/modules/inventory/schemas";
import { requirePermission } from "@/modules/permissions/permissions";
import { getMongoClient } from "@/server/db/client";
import {
  assertStoreAccess,
  type TenantContext,
} from "@/server/tenancy/context";

type StringIdDocument = { _id: string } & Record<string, unknown>;

interface InventoryProfileDocument {
  tenantId: string;
  planKey: string;
  billingStatus?: string;
  trialEndsAt?: Date;
  graceEndsAt?: Date;
  currentPeriodEndsAt?: Date;
  inventorySettings?: {
    allowNegativeStock?: boolean;
    lowStockAlerts?: {
      enabled?: boolean;
      includeLowStock?: boolean;
      includeOutOfStock?: boolean;
      version?: number;
    };
  };
}

interface StoreDocument {
  _id: string;
  tenantId: string;
  status: "active" | "archived";
  deletedAt?: Date;
}

interface ProductDocument {
  _id: string;
  tenantId: string;
  name: string;
  stock: number | null;
  inventoryTracking?: boolean;
  status: "draft" | "active" | "archived";
  allowedStoreIds?: string[];
  deletedAt?: Date;
  version: number;
}

interface VariantDocument {
  _id: string;
  tenantId: string;
  productId: string;
  name: string;
  sku: string;
  status?: "active" | "archived";
  deletedAt?: Date;
}

interface LevelDocument {
  _id: string;
  tenantId: string;
  storeId: string;
  variantId: string;
  quantity: number;
  version?: number;
}

interface ExistingAdjustmentDocument {
  _id: string;
  tenantId: string;
  storeId: string;
  variantId: string;
  mode: string;
  quantity: number;
  reason: string;
  note: string;
  newQuantity: number;
  idempotencyKey: string;
}

interface ExistingTransferDocument {
  _id: string;
  tenantId: string;
  fromStoreId: string;
  toStoreId: string;
  transferNumber: string;
  lines: Array<{ variantId: string; quantity: number }>;
  note: string;
  idempotencyKey: string;
}

export interface SaleInventoryLine {
  productId: string;
  variantId: string;
  quantity: number;
  expectedLevelVersion: number;
}

export class InventoryNotFoundError extends Error {
  constructor() {
    super("The requested inventory record was not found.");
    this.name = "InventoryNotFoundError";
  }
}

export class InventoryStoreUnavailableError extends Error {
  constructor() {
    super("Choose an active store available to this account.");
    this.name = "InventoryStoreUnavailableError";
  }
}

export class InventoryVersionConflictError extends Error {
  constructor() {
    super("Stock changed after this page was loaded.");
    this.name = "InventoryVersionConflictError";
  }
}

export class InventoryNegativeStockError extends Error {
  constructor() {
    super("This change would take stock below zero.");
    this.name = "InventoryNegativeStockError";
  }
}

export class InventoryProductUnavailableError extends Error {
  constructor(message = "This SKU is not available for the selected store.") {
    super(message);
    this.name = "InventoryProductUnavailableError";
  }
}

export class InventoryIdempotencyConflictError extends Error {
  constructor() {
    super("This request key has already been used for a different change.");
    this.name = "InventoryIdempotencyConflictError";
  }
}

export class ProductAvailabilityVersionConflictError extends Error {
  constructor() {
    super("Product availability changed after this page was loaded.");
    this.name = "ProductAvailabilityVersionConflictError";
  }
}

export class ProductStoreHasInventoryError extends Error {
  constructor() {
    super("Move or adjust this product to zero before removing the store.");
    this.name = "ProductStoreHasInventoryError";
  }
}

export class InventoryAlertSettingsVersionConflictError extends Error {
  constructor() {
    super("Alert preferences changed after this page was loaded.");
    this.name = "InventoryAlertSettingsVersionConflictError";
  }
}

async function loadWriteProfile(
  database: Db,
  tenantId: string,
  session: ClientSession,
): Promise<InventoryProfileDocument> {
  const profile = await database
    .collection<InventoryProfileDocument>("tenantProfiles")
    .findOne(
      { tenantId },
      {
        session,
        projection: {
          tenantId: 1,
          planKey: 1,
          billingStatus: 1,
          trialEndsAt: 1,
          graceEndsAt: 1,
          currentPeriodEndsAt: 1,
          inventorySettings: 1,
        },
      },
    );
  if (!profile) throw new InventoryNotFoundError();
  requireTenantWriteEntitlement(profile);
  return profile;
}

async function requireActiveStores(
  database: Db,
  session: ClientSession,
  context: TenantContext,
  storeIds: string[],
): Promise<void> {
  for (const storeId of storeIds) assertStoreAccess(context, storeId);
  const count = await database
    .collection<StoreDocument>("stores")
    .countDocuments(
      {
        tenantId: context.tenantId,
        _id: { $in: storeIds },
        status: "active",
        deletedAt: { $exists: false },
      },
      { session },
    );
  if (count !== storeIds.length) throw new InventoryStoreUnavailableError();
}

function productAvailableAtStore(
  product: ProductDocument,
  storeId: string,
): boolean {
  return (
    !product.allowedStoreIds ||
    product.allowedStoreIds.length === 0 ||
    product.allowedStoreIds.includes(storeId)
  );
}

async function loadVariantProducts(
  database: Db,
  session: ClientSession,
  context: TenantContext,
  variantIds: string[],
): Promise<{
  variantById: Map<string, VariantDocument>;
  productById: Map<string, ProductDocument>;
}> {
  const variants = await database
    .collection<VariantDocument>("productVariants")
    .find(
      {
        tenantId: context.tenantId,
        _id: { $in: variantIds },
        deletedAt: { $exists: false },
      },
      { session },
    )
    .toArray();
  if (variants.length !== variantIds.length)
    throw new InventoryProductUnavailableError();
  const productIds = [...new Set(variants.map((variant) => variant.productId))];
  const products = await database
    .collection<ProductDocument>("products")
    .find(
      {
        tenantId: context.tenantId,
        _id: { $in: productIds },
        inventoryTracking: { $ne: false },
        deletedAt: { $exists: false },
      },
      { session },
    )
    .toArray();
  if (products.length !== productIds.length)
    throw new InventoryProductUnavailableError();
  return {
    variantById: new Map(
      variants.map((variant) => [String(variant._id), variant]),
    ),
    productById: new Map(products.map((product) => [product._id, product])),
  };
}

async function loadLevel(
  database: Db,
  session: ClientSession,
  context: TenantContext,
  storeId: string,
  variantId: string,
): Promise<LevelDocument | null> {
  return database
    .collection<LevelDocument>("inventoryLevels")
    .findOne({ tenantId: context.tenantId, storeId, variantId }, { session });
}

async function writeLevel(
  database: Db,
  session: ClientSession,
  context: TenantContext,
  input: {
    storeId: string;
    variantId: string;
    current: LevelDocument | null;
    expectedVersion: number;
    newQuantity: number;
    now: Date;
  },
): Promise<number> {
  const currentVersion = input.current?.version ?? (input.current ? 1 : 0);
  if (currentVersion !== input.expectedVersion)
    throw new InventoryVersionConflictError();
  if (!input.current) {
    await database.collection<LevelDocument>("inventoryLevels").insertOne(
      {
        _id: createOpaqueId("lvl"),
        tenantId: context.tenantId,
        storeId: input.storeId,
        variantId: input.variantId,
        quantity: input.newQuantity,
        version: 1,
        createdAt: input.now,
        updatedAt: input.now,
        updatedBy: context.userId,
      } as LevelDocument,
      { session },
    );
    return 1;
  }
  const result = await database
    .collection<LevelDocument>("inventoryLevels")
    .updateOne(
      {
        _id: input.current._id,
        tenantId: context.tenantId,
        version: input.current.version ?? { $exists: false },
      },
      {
        $set: {
          quantity: input.newQuantity,
          updatedAt: input.now,
          updatedBy: context.userId,
        },
        $inc: { version: 1 },
      },
      { session },
    );
  if (result.matchedCount !== 1) throw new InventoryVersionConflictError();
  return currentVersion + 1;
}

async function appendMovement(
  database: Db,
  session: ClientSession,
  context: TenantContext,
  input: {
    storeId: string;
    productId: string;
    variantId: string;
    type: InventoryMovementType;
    quantityDelta: number;
    resultingQuantity: number;
    sourceType: "stock_adjustment" | "stock_transfer" | "product" | "sale";
    sourceId: string;
    note: string;
    idempotencyKey: string;
    now: Date;
  },
): Promise<void> {
  await database.collection<StringIdDocument>("inventoryMovements").insertOne(
    {
      _id: createOpaqueId("mov"),
      tenantId: context.tenantId,
      storeId: input.storeId,
      productId: input.productId,
      variantId: input.variantId,
      type: input.type,
      quantityDelta: input.quantityDelta,
      resultingQuantity: input.resultingQuantity,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      note: input.note,
      occurredAt: input.now,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.now,
      createdBy: context.userId,
    },
    { session },
  );
}

async function appendAudit(
  database: Db,
  session: ClientSession,
  context: TenantContext,
  input: {
    action: string;
    entityType: "stock_adjustment" | "stock_transfer" | "product" | "tenant";
    entityId: string;
    summary: string;
    changes: Record<string, unknown>;
    now: Date;
  },
): Promise<void> {
  await database.collection<StringIdDocument>("auditLogs").insertOne(
    {
      _id: createOpaqueId("aud"),
      tenantId: context.tenantId,
      actorId: context.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      requestId: context.requestId,
      summary: input.summary,
      changes: input.changes,
      createdAt: input.now,
    },
    { session },
  );
}

function sameTransferRequest(
  existing: ExistingTransferDocument,
  input: CreateStockTransferInput,
): boolean {
  return (
    existing.fromStoreId === input.fromStoreId &&
    existing.toStoreId === input.toStoreId &&
    existing.note === input.note &&
    existing.lines.length === input.lines.length &&
    existing.lines.every(
      (line, index) =>
        line.variantId === input.lines[index]?.variantId &&
        line.quantity === input.lines[index]?.quantity,
    )
  );
}

export class InventoryService {
  async adjust(
    context: TenantContext,
    untrustedInput: CreateStockAdjustmentInput,
  ): Promise<{ id: string; newQuantity: number; idempotent: boolean }> {
    requirePermission(context.permissions, "inventory:adjust");
    const input = createStockAdjustmentSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const adjustmentId = createOpaqueId("adj");
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        const existing = await database
          .collection<ExistingAdjustmentDocument>("stockAdjustments")
          .findOne(
            {
              tenantId: context.tenantId,
              idempotencyKey: input.idempotencyKey,
            },
            { session },
          );
        if (existing) {
          if (
            existing.storeId !== input.storeId ||
            existing.variantId !== input.variantId ||
            existing.mode !== input.mode ||
            existing.quantity !== input.quantity ||
            existing.reason !== input.reason ||
            existing.note !== input.note
          )
            throw new InventoryIdempotencyConflictError();
          return {
            id: String(existing._id),
            newQuantity: existing.newQuantity,
            idempotent: true,
          };
        }
        const profile = await loadWriteProfile(
          database,
          context.tenantId,
          session,
        );
        await requireActiveStores(database, session, context, [input.storeId]);
        const { variantById, productById } = await loadVariantProducts(
          database,
          session,
          context,
          [input.variantId],
        );
        const variant = variantById.get(input.variantId);
        const product = variant && productById.get(variant.productId);
        if (
          !variant ||
          !product ||
          !productAvailableAtStore(product, input.storeId)
        )
          throw new InventoryProductUnavailableError();
        const current = await loadLevel(
          database,
          session,
          context,
          input.storeId,
          input.variantId,
        );
        const previousQuantity = current?.quantity ?? 0;
        const quantityDelta = adjustmentDelta(
          input.mode,
          input.quantity,
          previousQuantity,
        );
        if (
          quantityDelta > 0 &&
          (product.status === "archived" || variant.status === "archived")
        )
          throw new InventoryProductUnavailableError(
            "Archived SKUs can only be reduced or reconciled down.",
          );
        const newQuantity = previousQuantity + quantityDelta;
        if (
          newQuantity < 0 &&
          profile.inventorySettings?.allowNegativeStock !== true
        )
          throw new InventoryNegativeStockError();
        const now = new Date();
        await writeLevel(database, session, context, {
          storeId: input.storeId,
          variantId: input.variantId,
          current,
          expectedVersion: input.expectedLevelVersion,
          newQuantity,
          now,
        });
        if (quantityDelta !== 0) {
          const productUpdate = await database
            .collection<ProductDocument>("products")
            .updateOne(
              {
                _id: product._id,
                tenantId: context.tenantId,
                stock: { $ne: null },
                deletedAt: { $exists: false },
              },
              {
                $inc: { stock: quantityDelta },
                $set: { updatedAt: now, updatedBy: context.userId },
              },
              { session },
            );
          if (productUpdate.matchedCount !== 1)
            throw new InventoryProductUnavailableError();
        }
        await appendMovement(database, session, context, {
          storeId: input.storeId,
          productId: product._id,
          variantId: input.variantId,
          type: adjustmentMovementType(input.reason),
          quantityDelta,
          resultingQuantity: newQuantity,
          sourceType: "stock_adjustment",
          sourceId: adjustmentId,
          note: input.note,
          idempotencyKey: `${input.idempotencyKey}:movement`,
          now,
        });
        await database
          .collection<StringIdDocument>("stockAdjustments")
          .insertOne(
            {
              _id: adjustmentId,
              tenantId: context.tenantId,
              storeId: input.storeId,
              productId: product._id,
              variantId: input.variantId,
              mode: input.mode,
              quantity: input.quantity,
              reason: input.reason,
              quantityDelta,
              previousQuantity,
              newQuantity,
              note: input.note,
              status: "posted",
              idempotencyKey: input.idempotencyKey,
              createdAt: now,
              createdBy: context.userId,
            },
            { session },
          );
        await appendAudit(database, session, context, {
          action: "inventory.adjusted",
          entityType: "stock_adjustment",
          entityId: adjustmentId,
          summary: `Adjusted ${variant.sku} by ${quantityDelta}.`,
          changes: {
            storeId: input.storeId,
            productId: product._id,
            variantId: input.variantId,
            reason: input.reason,
            previousQuantity,
            quantityDelta,
            newQuantity,
          },
          now,
        });
        return { id: adjustmentId, newQuantity, idempotent: false };
      }),
    );
    if (!result) throw new Error("The stock adjustment did not complete.");
    return result;
  }

  async transfer(
    context: TenantContext,
    untrustedInput: CreateStockTransferInput,
  ): Promise<{ id: string; transferNumber: string; idempotent: boolean }> {
    requirePermission(context.permissions, "inventory:transfer");
    const input = createStockTransferSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const transferId = createOpaqueId("trf");
    const transferNumber = `TRF-${transferId.slice(-8).toUpperCase()}`;
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        const existing = await database
          .collection<ExistingTransferDocument>("stockTransfers")
          .findOne(
            {
              tenantId: context.tenantId,
              idempotencyKey: input.idempotencyKey,
            },
            { session },
          );
        if (existing) {
          if (!sameTransferRequest(existing, input))
            throw new InventoryIdempotencyConflictError();
          return {
            id: String(existing._id),
            transferNumber: existing.transferNumber,
            idempotent: true,
          };
        }
        await loadWriteProfile(database, context.tenantId, session);
        await requireActiveStores(database, session, context, [
          input.fromStoreId,
          input.toStoreId,
        ]);
        const variantIds = input.lines.map((line) => line.variantId);
        const { variantById, productById } = await loadVariantProducts(
          database,
          session,
          context,
          variantIds,
        );
        const now = new Date();
        const persistedLines: Array<Record<string, unknown>> = [];
        for (const [index, line] of input.lines.entries()) {
          const variant = variantById.get(line.variantId);
          const product = variant && productById.get(variant.productId);
          if (
            !variant ||
            !product ||
            !productAvailableAtStore(product, input.fromStoreId) ||
            !productAvailableAtStore(product, input.toStoreId)
          )
            throw new InventoryProductUnavailableError();
          const source = await loadLevel(
            database,
            session,
            context,
            input.fromStoreId,
            line.variantId,
          );
          const destination = await loadLevel(
            database,
            session,
            context,
            input.toStoreId,
            line.variantId,
          );
          const sourceBefore = source?.quantity ?? 0;
          const destinationBefore = destination?.quantity ?? 0;
          if (sourceBefore < line.quantity)
            throw new InventoryNegativeStockError();
          const sourceAfter = sourceBefore - line.quantity;
          const destinationAfter = destinationBefore + line.quantity;
          await writeLevel(database, session, context, {
            storeId: input.fromStoreId,
            variantId: line.variantId,
            current: source,
            expectedVersion: line.expectedSourceVersion,
            newQuantity: sourceAfter,
            now,
          });
          await writeLevel(database, session, context, {
            storeId: input.toStoreId,
            variantId: line.variantId,
            current: destination,
            expectedVersion: line.expectedDestinationVersion,
            newQuantity: destinationAfter,
            now,
          });
          await appendMovement(database, session, context, {
            storeId: input.fromStoreId,
            productId: product._id,
            variantId: line.variantId,
            type: "transfer_out",
            quantityDelta: -line.quantity,
            resultingQuantity: sourceAfter,
            sourceType: "stock_transfer",
            sourceId: transferId,
            note: input.note,
            idempotencyKey: `${input.idempotencyKey}:out:${index}`,
            now,
          });
          await appendMovement(database, session, context, {
            storeId: input.toStoreId,
            productId: product._id,
            variantId: line.variantId,
            type: "transfer_in",
            quantityDelta: line.quantity,
            resultingQuantity: destinationAfter,
            sourceType: "stock_transfer",
            sourceId: transferId,
            note: input.note,
            idempotencyKey: `${input.idempotencyKey}:in:${index}`,
            now,
          });
          persistedLines.push({
            lineId: createOpaqueId("tln"),
            productId: product._id,
            variantId: line.variantId,
            productName: product.name,
            variantName: variant.name,
            sku: variant.sku,
            quantity: line.quantity,
            sourceBefore,
            sourceAfter,
            destinationBefore,
            destinationAfter,
          });
        }
        await database.collection<StringIdDocument>("stockTransfers").insertOne(
          {
            _id: transferId,
            tenantId: context.tenantId,
            transferNumber,
            fromStoreId: input.fromStoreId,
            toStoreId: input.toStoreId,
            status: "completed",
            lines: persistedLines,
            note: input.note,
            idempotencyKey: input.idempotencyKey,
            createdAt: now,
            createdBy: context.userId,
            completedAt: now,
            completedBy: context.userId,
            version: 1,
          },
          { session },
        );
        await appendAudit(database, session, context, {
          action: "inventory.transferred",
          entityType: "stock_transfer",
          entityId: transferId,
          summary: `Completed ${transferNumber} with ${input.lines.length} line${input.lines.length === 1 ? "" : "s"}.`,
          changes: {
            fromStoreId: input.fromStoreId,
            toStoreId: input.toStoreId,
            lines: persistedLines,
          },
          now,
        });
        return { id: transferId, transferNumber, idempotent: false };
      }),
    );
    if (!result) throw new Error("The stock transfer did not complete.");
    return result;
  }

  async updateProductAvailability(
    context: TenantContext,
    untrustedInput: UpdateProductAvailabilityInput,
  ): Promise<{ version: number; availableStoreIds: string[] }> {
    requirePermission(context.permissions, "product:update");
    const input = updateProductAvailabilitySchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await loadWriteProfile(database, context.tenantId, session);
        const activeStores = await database
          .collection<StoreDocument>("stores")
          .find(
            {
              tenantId: context.tenantId,
              status: "active",
              deletedAt: { $exists: false },
            },
            { session, projection: { _id: 1 } },
          )
          .sort({ createdAt: 1, _id: 1 })
          .toArray();
        const activeStoreIds = activeStores.map((store) => String(store._id));
        const authorizedActiveStoreIds = new Set(
          activeStoreIds.filter((storeId) =>
            context.allowedStoreIds.has(storeId),
          ),
        );
        if (
          input.availableStoreIds.some(
            (storeId) => !authorizedActiveStoreIds.has(storeId),
          )
        )
          throw new InventoryStoreUnavailableError();
        const product = await database
          .collection<ProductDocument>("products")
          .findOne(
            {
              _id: input.productId,
              tenantId: context.tenantId,
              deletedAt: { $exists: false },
            },
            { session },
          );
        if (!product) throw new InventoryProductUnavailableError();
        if (product.status === "archived")
          throw new InventoryProductUnavailableError(
            "Archived product availability cannot be changed.",
          );
        if (product.version !== input.expectedVersion)
          throw new ProductAvailabilityVersionConflictError();
        const currentStoreIds = effectiveStoreAvailability(
          product.allowedStoreIds,
          activeStoreIds,
        );
        const nextStoreIds = mergeScopedStoreAvailability(
          currentStoreIds,
          authorizedActiveStoreIds,
          input.availableStoreIds,
          activeStoreIds,
        );
        if (nextStoreIds.length === 0)
          throw new InventoryProductUnavailableError(
            "Keep the product available at one active store.",
          );
        const nextStoreIdSet = new Set(nextStoreIds);
        const removedStoreIds = currentStoreIds.filter(
          (storeId) =>
            authorizedActiveStoreIds.has(storeId) &&
            !nextStoreIdSet.has(storeId),
        );
        if (removedStoreIds.length > 0) {
          const variantIds = (
            await database
              .collection<VariantDocument>("productVariants")
              .find(
                {
                  tenantId: context.tenantId,
                  productId: product._id,
                  deletedAt: { $exists: false },
                },
                { session, projection: { _id: 1 } },
              )
              .toArray()
          ).map((variant) => String(variant._id));
          const stockBearingLevel =
            variantIds.length === 0
              ? null
              : await database
                  .collection<LevelDocument>("inventoryLevels")
                  .findOne(
                    {
                      tenantId: context.tenantId,
                      storeId: { $in: removedStoreIds },
                      variantId: { $in: variantIds },
                      quantity: { $ne: 0 },
                    },
                    { session, projection: { _id: 1 } },
                  );
          if (stockBearingLevel) throw new ProductStoreHasInventoryError();
        }
        const now = new Date();
        const update = await database
          .collection<ProductDocument>("products")
          .updateOne(
            {
              _id: product._id,
              tenantId: context.tenantId,
              version: input.expectedVersion,
              status: { $ne: "archived" },
              deletedAt: { $exists: false },
            },
            {
              $set: {
                allowedStoreIds: nextStoreIds,
                updatedAt: now,
                updatedBy: context.userId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
        if (update.matchedCount !== 1)
          throw new ProductAvailabilityVersionConflictError();
        await appendAudit(database, session, context, {
          action: "product.store_availability.updated",
          entityType: "product",
          entityId: product._id,
          summary: `Updated store availability for ${product.name}.`,
          changes: {
            before: { storeIds: currentStoreIds },
            after: { storeIds: nextStoreIds },
          },
          now,
        });
        return {
          version: input.expectedVersion + 1,
          availableStoreIds: nextStoreIds,
        };
      }),
    );
    if (!result) throw new Error("Product availability did not update.");
    return result;
  }

  async updateLowStockAlertPreferences(
    context: TenantContext,
    untrustedInput: UpdateLowStockAlertPreferencesInput,
  ): Promise<{ version: number }> {
    requirePermission(context.permissions, "settings:manage");
    const input = updateLowStockAlertPreferencesSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        const profile = await loadWriteProfile(
          database,
          context.tenantId,
          session,
        );
        const current = {
          enabled: profile.inventorySettings?.lowStockAlerts?.enabled ?? false,
          includeLowStock:
            profile.inventorySettings?.lowStockAlerts?.includeLowStock ?? true,
          includeOutOfStock:
            profile.inventorySettings?.lowStockAlerts?.includeOutOfStock ??
            true,
          version: profile.inventorySettings?.lowStockAlerts?.version ?? 1,
        };
        if (current.version !== input.expectedVersion)
          throw new InventoryAlertSettingsVersionConflictError();
        const now = new Date();
        const versionFilter =
          profile.inventorySettings?.lowStockAlerts?.version === undefined
            ? { $exists: false as const }
            : input.expectedVersion;
        const update = await database
          .collection<InventoryProfileDocument>("tenantProfiles")
          .updateOne(
            {
              tenantId: context.tenantId,
              "inventorySettings.lowStockAlerts.version": versionFilter,
            },
            {
              $set: {
                "inventorySettings.lowStockAlerts": {
                  enabled: input.enabled,
                  includeLowStock: input.includeLowStock,
                  includeOutOfStock: input.includeOutOfStock,
                  version: input.expectedVersion + 1,
                },
                updatedAt: now,
                updatedBy: context.userId,
              },
            },
            { session },
          );
        if (update.matchedCount !== 1)
          throw new InventoryAlertSettingsVersionConflictError();
        await appendAudit(database, session, context, {
          action: "inventory.low_stock_alerts.updated",
          entityType: "tenant",
          entityId: context.tenantId,
          summary: input.enabled
            ? "Enabled the inventory attention policy."
            : "Disabled the inventory attention policy.",
          changes: {
            before: current,
            after: {
              enabled: input.enabled,
              includeLowStock: input.includeLowStock,
              includeOutOfStock: input.includeOutOfStock,
              version: input.expectedVersion + 1,
            },
          },
          now,
        });
        return { version: input.expectedVersion + 1 };
      }),
    );
    if (!result) throw new Error("Inventory alert preferences did not update.");
    return result;
  }

  async recordOpeningBalanceInTransaction(
    database: Db,
    session: ClientSession,
    context: TenantContext,
    input: {
      productId: string;
      variantId: string;
      storeId: string;
      quantity: number;
      idempotencyKey: string;
      now: Date;
    },
  ): Promise<void> {
    if (input.quantity <= 0) return;
    await appendMovement(database, session, context, {
      storeId: input.storeId,
      productId: input.productId,
      variantId: input.variantId,
      type: "opening_balance",
      quantityDelta: input.quantity,
      resultingQuantity: input.quantity,
      sourceType: "product",
      sourceId: input.productId,
      note: "Opening stock",
      idempotencyKey: input.idempotencyKey,
      now: input.now,
    });
    await database.collection<StringIdDocument>("inventoryLevels").insertOne(
      {
        _id: createOpaqueId("lvl"),
        tenantId: context.tenantId,
        storeId: input.storeId,
        variantId: input.variantId,
        quantity: input.quantity,
        version: 1,
        createdAt: input.now,
        updatedAt: input.now,
        updatedBy: context.userId,
      },
      { session },
    );
  }

  async recordSaleInTransaction(
    database: Db,
    session: ClientSession,
    context: TenantContext,
    input: {
      saleId: string;
      receiptNumber: string;
      storeId: string;
      lines: SaleInventoryLine[];
      idempotencyKey: string;
      now: Date;
    },
  ): Promise<Array<{ variantId: string; resultingQuantity: number }>> {
    requirePermission(context.permissions, "sale:complete");
    if (input.lines.length === 0) return [];
    const profile = await loadWriteProfile(database, context.tenantId, session);
    await requireActiveStores(database, session, context, [input.storeId]);
    const variantIds = input.lines.map((line) => line.variantId);
    const { variantById, productById } = await loadVariantProducts(
      database,
      session,
      context,
      variantIds,
    );
    const results: Array<{
      variantId: string;
      resultingQuantity: number;
    }> = [];
    for (const [index, line] of input.lines.entries()) {
      const variant = variantById.get(line.variantId);
      const product = variant && productById.get(variant.productId);
      if (
        !variant ||
        !product ||
        product._id !== line.productId ||
        product.status !== "active" ||
        variant.status === "archived" ||
        !productAvailableAtStore(product, input.storeId)
      )
        throw new InventoryProductUnavailableError(
          "A sale item is no longer available at this store.",
        );
      const current = await loadLevel(
        database,
        session,
        context,
        input.storeId,
        line.variantId,
      );
      const previousQuantity = current?.quantity ?? 0;
      const resultingQuantity = previousQuantity - line.quantity;
      if (
        resultingQuantity < 0 &&
        profile.inventorySettings?.allowNegativeStock !== true
      )
        throw new InventoryNegativeStockError();
      await writeLevel(database, session, context, {
        storeId: input.storeId,
        variantId: line.variantId,
        current,
        expectedVersion: line.expectedLevelVersion,
        newQuantity: resultingQuantity,
        now: input.now,
      });
      const productUpdate = await database
        .collection<ProductDocument>("products")
        .updateOne(
          {
            _id: product._id,
            tenantId: context.tenantId,
            stock: { $ne: null },
            inventoryTracking: { $ne: false },
            status: "active",
            deletedAt: { $exists: false },
          },
          {
            $inc: { stock: -line.quantity },
            $set: { updatedAt: input.now, updatedBy: context.userId },
          },
          { session },
        );
      if (productUpdate.matchedCount !== 1)
        throw new InventoryProductUnavailableError();
      await appendMovement(database, session, context, {
        storeId: input.storeId,
        productId: product._id,
        variantId: line.variantId,
        type: "sale",
        quantityDelta: -line.quantity,
        resultingQuantity,
        sourceType: "sale",
        sourceId: input.saleId,
        note: `Sale ${input.receiptNumber}`,
        idempotencyKey: `${input.idempotencyKey}:movement:${index}`,
        now: input.now,
      });
      results.push({ variantId: line.variantId, resultingQuantity });
    }
    return results;
  }
}
