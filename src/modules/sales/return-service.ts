import "server-only";
import { createHash } from "node:crypto";
import type { ClientSession, Db } from "mongodb";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import { requireTenantWriteEntitlement } from "@/modules/billing/entitlements";
import { InventoryService } from "@/modules/inventory/service";
import { requirePermission } from "@/modules/permissions/permissions";
import { RecordedPaymentProvider } from "@/modules/sales/payment-provider";
import {
  calculateSaleReturn,
  projectReturnableSaleLines,
  type PreviousSaleReturnAllocation,
  type ReturnableSaleLineSnapshot,
} from "@/modules/sales/return-policy";
import {
  completeSaleReturnSchema,
  type CompleteSaleReturnInput,
  type SaleReturnReason,
} from "@/modules/sales/return-schemas";
import type { SalePaymentMethod } from "@/modules/sales/schemas";
import { getMongoClient } from "@/server/db/client";
import {
  assertStoreAccess,
  type TenantContext,
} from "@/server/tenancy/context";

type StringIdDocument = { _id: string } & Record<string, unknown>;

interface ReturnProfileDocument {
  tenantId: string;
  planKey: string;
  currency: string;
  billingStatus?: string;
  trialEndsAt?: Date;
  graceEndsAt?: Date;
  currentPeriodEndsAt?: Date;
}

interface ReturnStoreDocument {
  _id: string;
  tenantId: string;
  code: string;
  name: string;
  status: "active" | "archived";
  deletedAt?: Date;
}

interface ReturnSaleDocument {
  _id: string;
  tenantId: string;
  storeId: string;
  receiptNumber: string;
  status: "completed";
  currency: string;
  lines: ReturnableSaleLineSnapshot[];
}

interface CompletedReturnDocument {
  _id: string;
  tenantId: string;
  saleId: string;
  storeId: string;
  returnNumber: string;
  status: "completed";
  reason: SaleReturnReason;
  refundMethod: SalePaymentMethod;
  lines: PreviousSaleReturnAllocation[];
  idempotencyKey: string;
  requestFingerprint: string;
  completedAt: Date;
}

interface ExistingReturnDocument {
  _id: string;
  tenantId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  returnNumber: string;
  saleId: string;
}

interface ReturnSequenceDocument {
  _id: string;
  tenantId: string;
  storeId: string;
  sequenceType: "return";
  value: number;
}

interface ReturnRevenueProductDocument {
  _id: string;
  tenantId: string;
  revenueMinor: number;
  updatedAt: Date;
  updatedBy: string;
}

interface ReturnSaleProjectionDocument {
  _id: string;
  tenantId: string;
  returnedSubtotalMinor?: number;
  returnedDiscountMinor?: number;
  returnedTaxMinor?: number;
  returnedNetTotalMinor?: number;
  returnedTotalMinor?: number;
  returnedUnitCount?: number;
  returnedGrossProfitMinor?: number;
  version: number;
  lastReturnedAt?: Date;
  updatedAt: Date;
  updatedBy: string;
}

export class SaleReturnNotFoundError extends Error {
  constructor() {
    super("The completed sale could not be found.");
    this.name = "SaleReturnNotFoundError";
  }
}

export class SaleReturnStoreUnavailableError extends Error {
  constructor() {
    super("The original sale store is not active for this account.");
    this.name = "SaleReturnStoreUnavailableError";
  }
}

export class SaleReturnIdempotencyConflictError extends Error {
  constructor() {
    super("This return request key was already used for another return.");
    this.name = "SaleReturnIdempotencyConflictError";
  }
}

function requestFingerprint(input: CompleteSaleReturnInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function existingResult(
  database: Db,
  context: TenantContext,
  input: CompleteSaleReturnInput,
  session?: ClientSession,
): Promise<{
  id: string;
  saleId: string;
  returnNumber: string;
  idempotent: true;
} | null> {
  const existing = await database
    .collection<ExistingReturnDocument>("returns")
    .findOne(
      { tenantId: context.tenantId, idempotencyKey: input.idempotencyKey },
      { session },
    );
  if (!existing) return null;
  if (existing.requestFingerprint !== requestFingerprint(input))
    throw new SaleReturnIdempotencyConflictError();
  return {
    id: String(existing._id),
    saleId: existing.saleId,
    returnNumber: existing.returnNumber,
    idempotent: true,
  };
}

async function nextReturnNumber(
  database: Db,
  session: ClientSession,
  context: TenantContext,
  store: ReturnStoreDocument,
  now: Date,
): Promise<string> {
  const counter = await database
    .collection<ReturnSequenceDocument>("sequenceCounters")
    .findOneAndUpdate(
      {
        tenantId: context.tenantId,
        storeId: String(store._id),
        sequenceType: "return",
      },
      {
        $inc: { value: 1 },
        $set: { updatedAt: now, updatedBy: context.userId },
        $setOnInsert: {
          _id: createOpaqueId("seq"),
          tenantId: context.tenantId,
          storeId: String(store._id),
          sequenceType: "return",
          createdAt: now,
          createdBy: context.userId,
        },
      },
      { session, upsert: true, returnDocument: "after" },
    );
  if (!counter || !Number.isSafeInteger(counter.value))
    throw new Error("Return sequence did not advance.");
  return `${store.code.toUpperCase()}-R-${String(counter.value).padStart(6, "0")}`;
}

export class SaleReturnService {
  async complete(
    context: TenantContext,
    untrustedInput: CompleteSaleReturnInput,
  ): Promise<{
    id: string;
    saleId: string;
    returnNumber: string;
    idempotent: boolean;
  }> {
    requirePermission(context.permissions, "sale:refund");
    const input = completeSaleReturnSchema.parse(untrustedInput);
    assertStoreAccess(context, input.storeId);
    if (context.activeStoreId !== input.storeId)
      throw new SaleReturnStoreUnavailableError();
    const fingerprint = requestFingerprint(input);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const retry = await existingResult(database, context, input);
    if (retry) return retry;
    const returnId = createOpaqueId("ret");
    try {
      const result = await client.withSession((session) =>
        session.withTransaction(async () => {
          const transactionRetry = await existingResult(
            database,
            context,
            input,
            session,
          );
          if (transactionRetry) return transactionRetry;
          const [profile, store, sale, originalReceipt] = await Promise.all([
            database
              .collection<ReturnProfileDocument>("tenantProfiles")
              .findOne({ tenantId: context.tenantId }, { session }),
            database.collection<ReturnStoreDocument>("stores").findOne(
              {
                _id: input.storeId,
                tenantId: context.tenantId,
                status: "active",
                deletedAt: { $exists: false },
              },
              { session },
            ),
            database.collection<ReturnSaleDocument>("sales").findOne(
              {
                _id: input.saleId,
                tenantId: context.tenantId,
                storeId: input.storeId,
                status: "completed",
              },
              { session },
            ),
            database.collection("receipts").findOne(
              {
                tenantId: context.tenantId,
                storeId: input.storeId,
                saleId: input.saleId,
                status: "issued",
                $or: [
                  { entityType: "sale" },
                  { entityType: { $exists: false } },
                ],
              },
              { session, projection: { _id: 1 } },
            ),
          ]);
          if (!profile || !sale || !originalReceipt)
            throw new SaleReturnNotFoundError();
          requireTenantWriteEntitlement(profile);
          if (!store) throw new SaleReturnStoreUnavailableError();
          if (sale.currency !== profile.currency || sale.lines.length === 0)
            throw new SaleReturnNotFoundError();

          const previousReturns = await database
            .collection<CompletedReturnDocument>("returns")
            .find(
              {
                tenantId: context.tenantId,
                saleId: sale._id,
                storeId: input.storeId,
                status: "completed",
              },
              { session, projection: { lines: 1 } },
            )
            .toArray();
          const trackedVariantIds = sale.lines
            .filter((line) => line.inventoryTracking)
            .map((line) => line.variantId);
          const levels =
            trackedVariantIds.length === 0
              ? []
              : await database
                  .collection<{
                    tenantId: string;
                    storeId: string;
                    variantId: string;
                    version?: number;
                  }>("inventoryLevels")
                  .find(
                    {
                      tenantId: context.tenantId,
                      storeId: input.storeId,
                      variantId: { $in: trackedVariantIds },
                    },
                    { session, projection: { variantId: 1, version: 1 } },
                  )
                  .toArray();
          const returnableLines = projectReturnableSaleLines(
            sale.lines,
            previousReturns.flatMap((item) => item.lines),
            new Map(
              levels.map((level) => [level.variantId, level.version ?? 1]),
            ),
          );
          const calculated = calculateSaleReturn(returnableLines, input.lines);
          const now = new Date();
          const returnNumber = await nextReturnNumber(
            database,
            session,
            context,
            store,
            now,
          );
          const refundAuthorization =
            await new RecordedPaymentProvider().recordRefund({
              method: input.refundMethod,
              amountMinor: calculated.totalMinor,
              currency: profile.currency,
              idempotencyKey: input.idempotencyKey,
            });
          await new InventoryService().recordSaleReturnInTransaction(
            database,
            session,
            context,
            {
              returnId,
              returnNumber,
              storeId: input.storeId,
              lines: calculated.lines
                .filter((line) => line.inventoryTracking)
                .map((line) => ({
                  productId: line.productId,
                  variantId: line.variantId,
                  quantity: line.quantity,
                  expectedLevelVersion: line.expectedLevelVersion,
                })),
              idempotencyKey: input.idempotencyKey,
              now,
            },
          );

          const persistedLines = calculated.lines.map((line) => ({
            lineId: line.lineId,
            saleLineId: line.saleLineId,
            productId: line.productId,
            variantId: line.variantId,
            productName: line.productName,
            variantName: line.variantName,
            sku: line.sku,
            quantity: line.quantity,
            subtotalMinor: line.subtotalMinor,
            discountMinor: line.discountMinor,
            taxMinor: line.taxMinor,
            netTotalMinor: line.netTotalMinor,
            lineTotalMinor: line.lineTotalMinor,
            grossProfitReversalMinor: line.grossProfitReversalMinor,
            inventoryTracking: line.inventoryTracking,
          }));
          await database.collection<StringIdDocument>("returns").insertOne(
            {
              _id: returnId,
              tenantId: context.tenantId,
              storeId: input.storeId,
              saleId: sale._id,
              originalReceiptNumber: sale.receiptNumber,
              returnNumber,
              status: "completed",
              reason: input.reason,
              refundMethod: input.refundMethod,
              currency: profile.currency,
              lines: persistedLines,
              subtotalMinor: calculated.subtotalMinor,
              discountMinor: calculated.discountMinor,
              taxMinor: calculated.taxMinor,
              netTotalMinor: calculated.netTotalMinor,
              totalMinor: calculated.totalMinor,
              grossProfitReversalMinor: calculated.grossProfitReversalMinor,
              note: input.note,
              idempotencyKey: input.idempotencyKey,
              requestFingerprint: fingerprint,
              completedAt: now,
              completedBy: context.userId,
              createdAt: now,
              createdBy: context.userId,
              updatedAt: now,
              updatedBy: context.userId,
              version: 1,
            },
            { session },
          );
          const refundId = createOpaqueId("ref");
          await database.collection<StringIdDocument>("refunds").insertOne(
            {
              _id: refundId,
              tenantId: context.tenantId,
              storeId: input.storeId,
              saleId: sale._id,
              returnId,
              returnNumber,
              method: input.refundMethod,
              amountMinor: calculated.totalMinor,
              currency: profile.currency,
              status: refundAuthorization.status,
              provider: refundAuthorization.provider,
              externalReference: refundAuthorization.externalReference,
              recordedAt: now,
              recordedBy: context.userId,
              createdAt: now,
              createdBy: context.userId,
            },
            { session },
          );
          await database.collection<StringIdDocument>("receipts").insertOne(
            {
              _id: createOpaqueId("rcp"),
              tenantId: context.tenantId,
              storeId: input.storeId,
              saleId: sale._id,
              returnId,
              receiptNumber: returnNumber,
              entityType: "return",
              status: "issued",
              issuedAt: now,
              issuedBy: context.userId,
              createdAt: now,
              createdBy: context.userId,
            },
            { session },
          );

          const revenueByProduct = new Map<string, number>();
          for (const line of calculated.lines)
            revenueByProduct.set(
              line.productId,
              (revenueByProduct.get(line.productId) ?? 0) + line.netTotalMinor,
            );
          const revenueResult = await database
            .collection<ReturnRevenueProductDocument>("products")
            .bulkWrite(
              [...revenueByProduct].map(([productId, revenueMinor]) => ({
                updateOne: {
                  filter: { _id: productId, tenantId: context.tenantId },
                  update: {
                    $inc: { revenueMinor: -revenueMinor },
                    $set: { updatedAt: now, updatedBy: context.userId },
                  },
                },
              })),
              { session },
            );
          if (revenueResult.matchedCount !== revenueByProduct.size)
            throw new SaleReturnNotFoundError();
          const returnedUnitCount = calculated.lines.reduce(
            (sum, line) => sum + line.quantity,
            0,
          );
          const saleIncrements = {
            returnedSubtotalMinor: calculated.subtotalMinor,
            returnedDiscountMinor: calculated.discountMinor,
            returnedTaxMinor: calculated.taxMinor,
            returnedNetTotalMinor: calculated.netTotalMinor,
            returnedTotalMinor: calculated.totalMinor,
            returnedUnitCount,
            version: 1,
            ...(calculated.grossProfitReversalMinor === null
              ? {}
              : {
                  returnedGrossProfitMinor: calculated.grossProfitReversalMinor,
                }),
          };
          const saleUpdate = await database
            .collection<ReturnSaleProjectionDocument>("sales")
            .updateOne(
              { _id: sale._id, tenantId: context.tenantId },
              {
                $inc: saleIncrements,
                $set: {
                  lastReturnedAt: now,
                  updatedAt: now,
                  updatedBy: context.userId,
                },
              },
              { session },
            );
          if (saleUpdate.matchedCount !== 1)
            throw new SaleReturnNotFoundError();
          await database.collection<StringIdDocument>("auditLogs").insertOne(
            {
              _id: createOpaqueId("aud"),
              tenantId: context.tenantId,
              actorId: context.userId,
              action: "sale.returned",
              entityType: "return",
              entityId: returnId,
              requestId: context.requestId,
              summary: "Completed a sale return and recorded its refund.",
              changes: {
                after: {
                  saleId: sale._id,
                  returnNumber,
                  storeId: input.storeId,
                  lineCount: calculated.lines.length,
                  unitCount: calculated.lines.reduce(
                    (sum, line) => sum + line.quantity,
                    0,
                  ),
                  status: "completed",
                },
              },
              createdAt: now,
            },
            { session },
          );
          return {
            id: returnId,
            saleId: sale._id,
            returnNumber,
            idempotent: false,
          };
        }),
      );
      if (!result) throw new Error("Sale return did not finish.");
      return result;
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "MongoServerError" &&
        "code" in error &&
        error.code === 11000
      ) {
        const retry = await existingResult(database, context, input);
        if (retry) return retry;
      }
      throw error;
    }
  }
}
