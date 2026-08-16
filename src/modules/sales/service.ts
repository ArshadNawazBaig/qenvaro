import "server-only";
import { createHash } from "node:crypto";
import type { ClientSession, Db } from "mongodb";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import { requireTenantWriteEntitlement } from "@/modules/billing/entitlements";
import { InventoryService } from "@/modules/inventory/service";
import { requirePermission } from "@/modules/permissions/permissions";
import {
  allocateSalePayments,
  calculateSale,
  type ResolvedSaleLine,
} from "@/modules/sales/policy";
import { RecordedPaymentProvider } from "@/modules/sales/payment-provider";
import {
  completeSaleSchema,
  type CompleteSaleInput,
} from "@/modules/sales/schemas";
import { getMongoClient } from "@/server/db/client";
import {
  assertStoreAccess,
  type TenantContext,
} from "@/server/tenancy/context";

type StringIdDocument = { _id: string } & Record<string, unknown>;

interface SaleProfileDocument {
  tenantId: string;
  planKey: string;
  currency: string;
  billingStatus?: string;
  trialEndsAt?: Date;
  graceEndsAt?: Date;
  currentPeriodEndsAt?: Date;
}

interface SaleStoreDocument {
  _id: string;
  tenantId: string;
  code: string;
  name: string;
  status: "active" | "archived";
  deletedAt?: Date;
}

interface SaleProductDocument {
  _id: string;
  tenantId: string;
  name: string;
  type?: "simple" | "variant" | "service";
  inventoryTracking?: boolean;
  status: "draft" | "active" | "archived";
  currency: string;
  costMinor?: number;
  taxRateBps?: number;
  allowedStoreIds?: string[];
  deletedAt?: Date;
}

interface SaleVariantDocument {
  _id: string;
  tenantId: string;
  productId: string;
  name: string;
  sku: string;
  priceMinor: number;
  costMinor?: number;
  currency: string;
  status: "active" | "archived";
  deletedAt?: Date;
}

interface SaleCustomerDocument {
  _id: string;
  tenantId: string;
  code: string;
  name: string;
  status: "active" | "archived";
  deletedAt?: Date;
}

interface RevenueProductDocument {
  _id: string;
  tenantId: string;
  revenueMinor: number;
  updatedAt: Date;
  updatedBy: string;
  deletedAt?: Date;
}

interface ExistingSaleDocument {
  _id: string;
  tenantId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  receiptNumber: string;
}

interface SequenceDocument {
  _id: string;
  tenantId: string;
  storeId: string;
  sequenceType: "receipt";
  value: number;
}

export class SaleNotFoundError extends Error {
  constructor() {
    super("The requested sale was not found.");
    this.name = "SaleNotFoundError";
  }
}

export class SaleStoreUnavailableError extends Error {
  constructor() {
    super("Choose an active store available to this account.");
    this.name = "SaleStoreUnavailableError";
  }
}

export class SaleProductUnavailableError extends Error {
  constructor(message = "One or more sale items are no longer available.") {
    super(message);
    this.name = "SaleProductUnavailableError";
  }
}

export class SaleCustomerUnavailableError extends Error {
  constructor() {
    super("Choose an active customer from this business.");
    this.name = "SaleCustomerUnavailableError";
  }
}

export class SaleIdempotencyConflictError extends Error {
  constructor() {
    super("This checkout request key was already used for another sale.");
    this.name = "SaleIdempotencyConflictError";
  }
}

function requestFingerprint(input: CompleteSaleInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function productAvailableAtStore(
  product: SaleProductDocument,
  storeId: string,
): boolean {
  return (
    !product.allowedStoreIds ||
    product.allowedStoreIds.length === 0 ||
    product.allowedStoreIds.includes(storeId)
  );
}

function safeMinor(value: number | undefined): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : null;
}

function safeTaxRate(value: number | undefined): number {
  return Number.isInteger(value) &&
    Number(value) >= 0 &&
    Number(value) <= 10_000
    ? Number(value)
    : 0;
}

async function requireWriteProfile(
  database: Db,
  tenantId: string,
  session: ClientSession,
): Promise<SaleProfileDocument> {
  const profile = await database
    .collection<SaleProfileDocument>("tenantProfiles")
    .findOne(
      { tenantId },
      {
        session,
        projection: {
          tenantId: 1,
          planKey: 1,
          currency: 1,
          billingStatus: 1,
          trialEndsAt: 1,
          graceEndsAt: 1,
          currentPeriodEndsAt: 1,
        },
      },
    );
  if (!profile) throw new SaleNotFoundError();
  requireTenantWriteEntitlement(profile);
  return profile;
}

async function nextReceiptNumber(
  database: Db,
  session: ClientSession,
  context: TenantContext,
  store: SaleStoreDocument,
  now: Date,
): Promise<string> {
  const counter = await database
    .collection<SequenceDocument>("sequenceCounters")
    .findOneAndUpdate(
      {
        tenantId: context.tenantId,
        storeId: String(store._id),
        sequenceType: "receipt",
      },
      {
        $inc: { value: 1 },
        $set: { updatedAt: now, updatedBy: context.userId },
        $setOnInsert: {
          _id: createOpaqueId("seq"),
          tenantId: context.tenantId,
          storeId: String(store._id),
          sequenceType: "receipt",
          createdAt: now,
          createdBy: context.userId,
        },
      },
      { session, upsert: true, returnDocument: "after" },
    );
  if (!counter || !Number.isSafeInteger(counter.value))
    throw new Error("Receipt sequence did not advance.");
  return `${store.code.toUpperCase()}-${String(counter.value).padStart(6, "0")}`;
}

async function existingResult(
  database: Db,
  context: TenantContext,
  input: CompleteSaleInput,
  session?: ClientSession,
): Promise<{ id: string; receiptNumber: string; idempotent: true } | null> {
  const existing = await database
    .collection<ExistingSaleDocument>("sales")
    .findOne(
      {
        tenantId: context.tenantId,
        idempotencyKey: input.idempotencyKey,
      },
      { session },
    );
  if (!existing) return null;
  if (existing.requestFingerprint !== requestFingerprint(input))
    throw new SaleIdempotencyConflictError();
  return {
    id: String(existing._id),
    receiptNumber: existing.receiptNumber,
    idempotent: true,
  };
}

export class SaleService {
  async complete(
    context: TenantContext,
    untrustedInput: CompleteSaleInput,
  ): Promise<{ id: string; receiptNumber: string; idempotent: boolean }> {
    requirePermission(context.permissions, "sale:complete");
    const input = completeSaleSchema.parse(untrustedInput);
    assertStoreAccess(context, input.storeId);
    if (context.activeStoreId !== input.storeId)
      throw new SaleStoreUnavailableError();
    const fingerprint = requestFingerprint(input);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const retry = await existingResult(database, context, input);
    if (retry) return retry;
    const paymentProfile = await database
      .collection<SaleProfileDocument>("tenantProfiles")
      .findOne({ tenantId: context.tenantId }, { projection: { currency: 1 } });
    if (!paymentProfile) throw new SaleNotFoundError();
    const paymentProvider = new RecordedPaymentProvider();
    const authorizations = await Promise.all(
      input.payments.map((payment) =>
        paymentProvider.authorize({
          method: payment.method,
          tenderedMinor: payment.tenderedMinor,
          currency: paymentProfile.currency,
        }),
      ),
    );
    const saleId = createOpaqueId("sal");
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
          const [profile, store] = await Promise.all([
            requireWriteProfile(database, context.tenantId, session),
            database.collection<SaleStoreDocument>("stores").findOne(
              {
                _id: input.storeId,
                tenantId: context.tenantId,
                status: "active",
                deletedAt: { $exists: false },
              },
              { session },
            ),
          ]);
          if (!store) throw new SaleStoreUnavailableError();
          const customer = input.customerId
            ? await database
                .collection<SaleCustomerDocument>("customers")
                .findOne(
                  {
                    _id: input.customerId,
                    tenantId: context.tenantId,
                    status: "active",
                    deletedAt: { $exists: false },
                  },
                  { session },
                )
            : null;
          if (input.customerId && !customer)
            throw new SaleCustomerUnavailableError();

          const variantIds = input.lines.map((line) => line.variantId);
          const variants = await database
            .collection<SaleVariantDocument>("productVariants")
            .find(
              {
                tenantId: context.tenantId,
                _id: { $in: variantIds },
                status: "active",
                deletedAt: { $exists: false },
              },
              { session },
            )
            .toArray();
          if (variants.length !== variantIds.length)
            throw new SaleProductUnavailableError();
          const variantById = new Map(
            variants.map((variant) => [String(variant._id), variant]),
          );
          const productIds = [
            ...new Set(variants.map((variant) => variant.productId)),
          ];
          const products = await database
            .collection<SaleProductDocument>("products")
            .find(
              {
                tenantId: context.tenantId,
                _id: { $in: productIds },
                status: "active",
                deletedAt: { $exists: false },
              },
              { session },
            )
            .toArray();
          if (products.length !== productIds.length)
            throw new SaleProductUnavailableError();
          const productById = new Map(
            products.map((product) => [String(product._id), product]),
          );
          const resolvedLines: ResolvedSaleLine[] = input.lines.map((line) => {
            const variant = variantById.get(line.variantId);
            const product = variant && productById.get(variant.productId);
            const unitPriceMinor = safeMinor(variant?.priceMinor);
            if (
              !variant ||
              !product ||
              unitPriceMinor === null ||
              variant.currency !== profile.currency ||
              product.currency !== profile.currency ||
              !productAvailableAtStore(product, input.storeId)
            )
              throw new SaleProductUnavailableError();
            return {
              ...line,
              productId: String(product._id),
              productName: product.name,
              variantName: variant.name,
              sku: variant.sku,
              unitPriceMinor,
              unitCostMinor:
                safeMinor(variant.costMinor) ?? safeMinor(product.costMinor),
              taxRateBps: safeTaxRate(product.taxRateBps),
              inventoryTracking:
                product.inventoryTracking !== false &&
                product.type !== "service",
            };
          });
          const calculated = calculateSale(resolvedLines);
          const paymentAllocation = allocateSalePayments(
            calculated.totalMinor,
            input.payments,
          );
          const now = new Date();
          const receiptNumber = await nextReceiptNumber(
            database,
            session,
            context,
            store,
            now,
          );
          await new InventoryService().recordSaleInTransaction(
            database,
            session,
            context,
            {
              saleId,
              receiptNumber,
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
            productId: line.productId,
            variantId: line.variantId,
            productName: line.productName,
            variantName: line.variantName,
            sku: line.sku,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            unitCostMinor: line.unitCostMinor,
            subtotalMinor: line.subtotalMinor,
            discountBps: line.discountBps,
            discountMinor: line.discountMinor,
            taxRateBps: line.taxRateBps,
            taxMinor: line.taxMinor,
            lineTotalMinor: line.lineTotalMinor,
            grossProfitMinor: line.grossProfitMinor,
            inventoryTracking: line.inventoryTracking,
          }));
          await database.collection<StringIdDocument>("sales").insertOne(
            {
              _id: saleId,
              tenantId: context.tenantId,
              storeId: input.storeId,
              receiptNumber,
              customer: customer
                ? {
                    id: String(customer._id),
                    code: customer.code,
                    name: customer.name,
                  }
                : null,
              status: "completed",
              currency: profile.currency,
              lines: persistedLines,
              subtotalMinor: calculated.subtotalMinor,
              discountMinor: calculated.discountMinor,
              taxMinor: calculated.taxMinor,
              netTotalMinor: calculated.netTotalMinor,
              totalMinor: calculated.totalMinor,
              grossProfitMinor: calculated.grossProfitMinor,
              tenderedMinor: paymentAllocation.tenderedMinor,
              changeMinor: paymentAllocation.changeMinor,
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

          const paymentDocuments = paymentAllocation.payments.map(
            (payment, index) => ({
              _id: createOpaqueId("pay"),
              tenantId: context.tenantId,
              storeId: input.storeId,
              saleId,
              receiptNumber,
              method: payment.method,
              tenderedMinor: payment.tenderedMinor,
              appliedMinor: payment.appliedMinor,
              currency: profile.currency,
              status: authorizations[index]?.status ?? "recorded",
              provider: authorizations[index]?.provider ?? "manual",
              externalReference: null,
              recordedAt: now,
              recordedBy: context.userId,
              createdAt: now,
              createdBy: context.userId,
            }),
          );
          await database
            .collection<StringIdDocument>("salePayments")
            .insertMany(paymentDocuments, { session });
          await database.collection<StringIdDocument>("receipts").insertOne(
            {
              _id: createOpaqueId("rcp"),
              tenantId: context.tenantId,
              storeId: input.storeId,
              saleId,
              receiptNumber,
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
              (revenueByProduct.get(line.productId) ?? 0) +
                line.subtotalMinor -
                line.discountMinor,
            );
          await database
            .collection<RevenueProductDocument>("products")
            .bulkWrite(
              [...revenueByProduct].map(([productId, revenueMinor]) => ({
                updateOne: {
                  filter: {
                    _id: productId,
                    tenantId: context.tenantId,
                    deletedAt: { $exists: false },
                  },
                  update: {
                    $inc: { revenueMinor },
                    $set: { updatedAt: now, updatedBy: context.userId },
                  },
                },
              })),
              { session },
            );
          await database.collection<StringIdDocument>("auditLogs").insertOne(
            {
              _id: createOpaqueId("aud"),
              tenantId: context.tenantId,
              actorId: context.userId,
              action: "sale.completed",
              entityType: "sale",
              entityId: saleId,
              requestId: context.requestId,
              summary: "Completed a point-of-sale checkout.",
              changes: {
                after: {
                  receiptNumber,
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
          return { id: saleId, receiptNumber, idempotent: false };
        }),
      );
      if (!result) throw new Error("Sale completion did not finish.");
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
