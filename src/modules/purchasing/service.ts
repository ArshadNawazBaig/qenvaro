import "server-only";
import type { ClientSession, Db } from "mongodb";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import {
  requireFeature,
  requireTenantWriteEntitlement,
} from "@/modules/billing/entitlements";
import { InventoryService } from "@/modules/inventory/service";
import { requirePermission } from "@/modules/permissions/permissions";
import { calculatePurchaseLine, requirePurchaseTransition } from "./policy";
import {
  archiveSupplierSchema,
  createExpenseSchema,
  createPurchaseOrderSchema,
  createSupplierCode,
  createSupplierSchema,
  decideExpenseSchema,
  normalizeSupplierValue,
  receivePurchaseOrderSchema,
  transitionPurchaseOrderSchema,
  updateSupplierSchema,
  type ArchiveSupplierInput,
  type CreateExpenseInput,
  type CreatePurchaseOrderInput,
  type CreateSupplierInput,
  type DecideExpenseInput,
  type ExpenseStatus,
  type PurchaseLineSnapshot,
  type PurchaseStatus,
  type ReceivePurchaseOrderInput,
  type TransitionPurchaseOrderInput,
  type UpdateSupplierInput,
} from "./schemas";
import { getMongoClient } from "@/server/db/client";
import type { CloudinaryProductImageUpload } from "@/server/media/cloudinary";
import {
  assertStoreAccess,
  TenantNotFoundError,
  type TenantContext,
} from "@/server/tenancy/context";

type StringIdDocument = { _id: string } & Record<string, unknown>;

interface BillingProfile {
  planKey: string;
  currency: string;
  billingStatus?: string;
  trialEndsAt?: Date;
  graceEndsAt?: Date;
  currentPeriodEndsAt?: Date;
}

interface SupplierDocument {
  _id: string;
  tenantId: string;
  supplierCode: string;
  name: string;
  normalizedName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  taxNumber: string;
  paymentTerms: string;
  notes: string;
  status: "active" | "archived";
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

interface VariantDocument {
  _id: string;
  tenantId: string;
  productId: string;
  name: string;
  sku: string;
  costMinor?: number;
  status?: string;
}

interface ProductDocument {
  _id: string;
  tenantId: string;
  name: string;
  costMinor?: number;
  inventoryTracking?: boolean;
  status: string;
  allowedStoreIds?: string[];
}

interface PurchaseOrderDocument {
  _id: string;
  tenantId: string;
  purchaseOrderNumber: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  storeId: string;
  expectedDeliveryDate: string;
  note: string;
  currency: string;
  status: PurchaseStatus;
  lines: PurchaseLineSnapshot[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  idempotencyKey: string;
  requestFingerprint: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

interface ExpenseDocument {
  _id: string;
  tenantId: string;
  expenseNumber: string;
  storeId: string;
  category: string;
  normalizedCategory: string;
  vendor: string;
  normalizedVendor: string;
  expenseDate: string;
  amountMinor: number;
  currency: string;
  notes: string;
  receiptUrl: string;
  status: ExpenseStatus;
  decisionNote: string;
  idempotencyKey: string;
  requestFingerprint: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

export class PurchasingNotFoundError extends Error {
  constructor() {
    super("The requested purchasing record was not found.");
    this.name = "PurchasingNotFoundError";
  }
}

export class PurchasingConflictError extends Error {
  constructor(message = "This record changed after the page was loaded.") {
    super(message);
    this.name = "PurchasingConflictError";
  }
}

export class PurchasingDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchasingDomainError";
  }
}

async function requireWriteAccess(
  database: Db,
  context: TenantContext,
  session: ClientSession,
): Promise<BillingProfile> {
  const profile = await database
    .collection<BillingProfile>("tenantProfiles")
    .findOne(
      { tenantId: context.tenantId },
      {
        session,
        projection: {
          planKey: 1,
          currency: 1,
          billingStatus: 1,
          trialEndsAt: 1,
          graceEndsAt: 1,
          currentPeriodEndsAt: 1,
        },
      },
    );
  if (!profile) throw new TenantNotFoundError();
  requireTenantWriteEntitlement(profile);
  return profile;
}

async function requirePurchasingWriteAccess(
  database: Db,
  context: TenantContext,
  session: ClientSession,
): Promise<BillingProfile> {
  const profile = await requireWriteAccess(database, context, session);
  requireFeature(requireTenantWriteEntitlement(profile), "purchasing");
  return profile;
}

async function requireStore(
  database: Db,
  context: TenantContext,
  storeId: string,
  session: ClientSession,
) {
  assertStoreAccess(context, storeId);
  const store = await database.collection<{ _id: string }>("stores").findOne(
    {
      _id: storeId,
      tenantId: context.tenantId,
      status: "active",
      deletedAt: { $exists: false },
    },
    { session, projection: { _id: 1 } },
  );
  if (!store) throw new TenantNotFoundError();
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

async function nextNumber(
  database: Db,
  context: TenantContext,
  session: ClientSession,
  storeId: string,
  sequenceType: "purchase_order" | "goods_receipt" | "expense",
  prefix: string,
) {
  const sequence = await database
    .collection<{ _id: string; value: number }>("sequenceCounters")
    .findOneAndUpdate(
      { _id: `${context.tenantId}:${storeId}:${sequenceType}` },
      {
        $inc: { value: 1 },
        $setOnInsert: {
          tenantId: context.tenantId,
          storeId,
          sequenceType,
          createdAt: new Date(),
        },
        $set: { updatedAt: new Date() },
      },
      { session, upsert: true, returnDocument: "after" },
    );
  if (!sequence) throw new Error("Number generation failed.");
  return `${prefix}-${String(sequence.value).padStart(6, "0")}`;
}

function supplierFields(input: CreateSupplierInput) {
  return {
    name: input.name,
    normalizedName: normalizeSupplierValue(input.name),
    contactName: input.contactName,
    email: input.email,
    phone: input.phone,
    address: input.address,
    taxNumber: input.taxNumber,
    paymentTerms: input.paymentTerms,
    notes: input.notes,
  };
}

function purchaseFingerprint(input: CreatePurchaseOrderInput) {
  return JSON.stringify({
    supplierId: input.supplierId,
    storeId: input.storeId,
    expectedDeliveryDate: input.expectedDeliveryDate,
    note: input.note,
    lines: input.lines,
  });
}

function expenseFingerprint(input: CreateExpenseInput) {
  return JSON.stringify({
    storeId: input.storeId,
    category: input.category,
    vendor: input.vendor,
    expenseDate: input.expenseDate,
    amountMinor: input.amountMinor,
    notes: input.notes,
    receiptUrl: input.receiptUrl,
  });
}

export class SupplierService {
  async create(context: TenantContext, untrusted: CreateSupplierInput) {
    requirePermission(context.permissions, "supplier:create");
    const input = createSupplierSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const id = createOpaqueId("sup");
    const supplierCode = createSupplierCode(id);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requirePurchasingWriteAccess(database, context, session);
        const now = new Date();
        await database.collection<SupplierDocument>("suppliers").insertOne(
          {
            _id: id,
            tenantId: context.tenantId,
            supplierCode,
            ...supplierFields(input),
            status: "active",
            version: 1,
            createdAt: now,
            updatedAt: now,
            createdBy: context.userId,
            updatedBy: context.userId,
          },
          { session },
        );
        await audit(database, context, session, {
          action: "supplier.created",
          entityType: "supplier",
          entityId: id,
          summary: "Created a supplier profile.",
          changes: {
            after: {
              supplierCode,
              status: "active",
              hasEmail: Boolean(input.email),
            },
          },
        });
        return { id, supplierCode, version: 1 };
      }),
    );
    if (!result) throw new Error("Supplier creation did not complete.");
    return result;
  }

  async update(context: TenantContext, untrusted: UpdateSupplierInput) {
    requirePermission(context.permissions, "supplier:update");
    const input = updateSupplierSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requirePurchasingWriteAccess(database, context, session);
        const suppliers = database.collection<SupplierDocument>("suppliers");
        const existing = await suppliers.findOne(
          { _id: input.supplierId, tenantId: context.tenantId },
          { session },
        );
        if (!existing) throw new PurchasingNotFoundError();
        if (existing.status === "archived")
          throw new PurchasingDomainError(
            "Archived suppliers cannot be edited.",
          );
        if (existing.version !== input.expectedVersion)
          throw new PurchasingConflictError();
        const update = await suppliers.updateOne(
          {
            _id: input.supplierId,
            tenantId: context.tenantId,
            version: input.expectedVersion,
          },
          {
            $set: {
              ...supplierFields(input),
              updatedAt: new Date(),
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1) throw new PurchasingConflictError();
        await audit(database, context, session, {
          action: "supplier.updated",
          entityType: "supplier",
          entityId: input.supplierId,
          summary: "Updated a supplier profile.",
          changes: {
            after: { status: existing.status, hasEmail: Boolean(input.email) },
          },
        });
        return { version: input.expectedVersion + 1 };
      }),
    );
    if (!result) throw new Error("Supplier update did not complete.");
    return result;
  }

  async archive(context: TenantContext, untrusted: ArchiveSupplierInput) {
    requirePermission(context.permissions, "supplier:update");
    const input = archiveSupplierSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requirePurchasingWriteAccess(database, context, session);
        const supplier = await database
          .collection<SupplierDocument>("suppliers")
          .findOne(
            { _id: input.supplierId, tenantId: context.tenantId },
            { session },
          );
        if (!supplier) throw new PurchasingNotFoundError();
        if (supplier.status === "archived")
          return { version: supplier.version, unchanged: true };
        if (supplier.version !== input.expectedVersion)
          throw new PurchasingConflictError();
        const openOrders = await database
          .collection("purchaseOrders")
          .countDocuments(
            {
              tenantId: context.tenantId,
              supplierId: input.supplierId,
              status: {
                $in: ["draft", "submitted", "approved", "partially_received"],
              },
            },
            { session },
          );
        if (openOrders > 0)
          throw new PurchasingDomainError(
            "Complete or cancel this supplier's open purchase orders first.",
          );
        const update = await database
          .collection<SupplierDocument>("suppliers")
          .updateOne(
            {
              _id: input.supplierId,
              tenantId: context.tenantId,
              version: input.expectedVersion,
            },
            {
              $set: {
                status: "archived",
                archivedAt: new Date(),
                updatedAt: new Date(),
                updatedBy: context.userId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
        if (update.matchedCount !== 1) throw new PurchasingConflictError();
        await audit(database, context, session, {
          action: "supplier.archived",
          entityType: "supplier",
          entityId: input.supplierId,
          summary: "Archived a supplier profile.",
          changes: {
            before: { status: "active" },
            after: { status: "archived" },
          },
        });
        return { version: input.expectedVersion + 1, unchanged: false };
      }),
    );
    if (!result) throw new Error("Supplier archive did not complete.");
    return result;
  }
}

export class PurchaseOrderService {
  async create(context: TenantContext, untrusted: CreatePurchaseOrderInput) {
    requirePermission(context.permissions, "purchase:create");
    const input = createPurchaseOrderSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        const profile = await requirePurchasingWriteAccess(
          database,
          context,
          session,
        );
        await requireStore(database, context, input.storeId, session);
        const orders =
          database.collection<PurchaseOrderDocument>("purchaseOrders");
        const fingerprint = purchaseFingerprint(input);
        const existing = await orders.findOne(
          { tenantId: context.tenantId, idempotencyKey: input.idempotencyKey },
          { session },
        );
        if (existing) {
          if (existing.requestFingerprint !== fingerprint)
            throw new PurchasingConflictError(
              "That purchase request key was used for different input.",
            );
          return {
            id: existing._id,
            purchaseOrderNumber: existing.purchaseOrderNumber,
            replayed: true,
          };
        }
        const supplier = await database
          .collection<SupplierDocument>("suppliers")
          .findOne(
            {
              _id: input.supplierId,
              tenantId: context.tenantId,
              status: "active",
            },
            { session },
          );
        if (!supplier) throw new PurchasingNotFoundError();
        const variantIds = input.lines.map((line) => line.variantId);
        if (new Set(variantIds).size !== variantIds.length)
          throw new PurchasingDomainError(
            "Each SKU can appear only once on an order.",
          );
        const variants = await database
          .collection<VariantDocument>("productVariants")
          .find(
            {
              tenantId: context.tenantId,
              _id: { $in: variantIds },
              status: { $ne: "archived" },
              deletedAt: { $exists: false },
            },
            { session },
          )
          .toArray();
        if (variants.length !== variantIds.length)
          throw new PurchasingNotFoundError();
        const productIds = [
          ...new Set(variants.map((variant) => variant.productId)),
        ];
        const products = await database
          .collection<ProductDocument>("products")
          .find(
            {
              tenantId: context.tenantId,
              _id: { $in: productIds },
              inventoryTracking: { $ne: false },
              status: { $ne: "archived" },
              deletedAt: { $exists: false },
            },
            { session },
          )
          .toArray();
        if (products.length !== productIds.length)
          throw new PurchasingNotFoundError();
        const variantMap = new Map(
          variants.map((variant) => [variant._id, variant]),
        );
        const productMap = new Map(
          products.map((product) => [product._id, product]),
        );
        const lines: PurchaseLineSnapshot[] = input.lines.map((line) => {
          const variant = variantMap.get(line.variantId);
          const product = variant && productMap.get(variant.productId);
          if (
            !variant ||
            !product ||
            (product.allowedStoreIds?.length &&
              !product.allowedStoreIds.includes(input.storeId))
          )
            throw new PurchasingNotFoundError();
          const totals = calculatePurchaseLine(line);
          return {
            lineId: createOpaqueId("pol"),
            productId: product._id,
            variantId: variant._id,
            productName: product.name,
            variantName: variant.name,
            sku: variant.sku,
            orderedQuantity: line.quantity,
            receivedQuantity: 0,
            unitCostMinor: line.unitCostMinor,
            taxRateBps: line.taxRateBps,
            ...totals,
          };
        });
        const subtotalMinor = lines.reduce(
          (sum, line) => sum + line.subtotalMinor,
          0,
        );
        const taxMinor = lines.reduce((sum, line) => sum + line.taxMinor, 0);
        const totalMinor = lines.reduce(
          (sum, line) => sum + line.totalMinor,
          0,
        );
        const purchaseOrderNumber = await nextNumber(
          database,
          context,
          session,
          input.storeId,
          "purchase_order",
          "PO",
        );
        const id = createOpaqueId("pur");
        const now = new Date();
        await orders.insertOne(
          {
            _id: id,
            tenantId: context.tenantId,
            purchaseOrderNumber,
            supplierId: supplier._id,
            supplierCode: supplier.supplierCode,
            supplierName: supplier.name,
            storeId: input.storeId,
            expectedDeliveryDate: input.expectedDeliveryDate,
            note: input.note,
            currency: profile.currency,
            status: "draft",
            lines,
            subtotalMinor,
            taxMinor,
            totalMinor,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: fingerprint,
            version: 1,
            createdAt: now,
            updatedAt: now,
            createdBy: context.userId,
            updatedBy: context.userId,
          },
          { session },
        );
        await audit(database, context, session, {
          action: "purchase.created",
          entityType: "purchaseOrder",
          entityId: id,
          summary: "Created a draft purchase order.",
          changes: {
            after: {
              purchaseOrderNumber,
              supplierId: supplier._id,
              storeId: input.storeId,
              lineCount: lines.length,
              status: "draft",
            },
          },
        });
        return { id, purchaseOrderNumber, replayed: false };
      }),
    );
    if (!result) throw new Error("Purchase order creation did not complete.");
    return result;
  }

  async transition(
    context: TenantContext,
    untrusted: TransitionPurchaseOrderInput,
  ) {
    const input = transitionPurchaseOrderSchema.parse(untrusted);
    const permission =
      input.targetStatus === "approved"
        ? "purchase:approve"
        : input.targetStatus === "cancelled"
          ? "purchase:cancel"
          : "purchase:create";
    requirePermission(context.permissions, permission);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requirePurchasingWriteAccess(database, context, session);
        const orders =
          database.collection<PurchaseOrderDocument>("purchaseOrders");
        const order = await orders.findOne(
          {
            _id: input.purchaseOrderId,
            tenantId: context.tenantId,
            storeId: { $in: [...context.allowedStoreIds] },
          },
          { session },
        );
        if (!order) throw new PurchasingNotFoundError();
        if (order.version !== input.expectedVersion)
          throw new PurchasingConflictError();
        requirePurchaseTransition(order.status, input.targetStatus);
        if (input.targetStatus === "cancelled" && input.reason.length < 3)
          throw new PurchasingDomainError("A cancellation reason is required.");
        const update = await orders.updateOne(
          {
            _id: order._id,
            tenantId: context.tenantId,
            version: input.expectedVersion,
            status: order.status,
          },
          {
            $set: {
              status: input.targetStatus,
              ...(input.targetStatus === "cancelled"
                ? {
                    cancelledAt: new Date(),
                    cancelledBy: context.userId,
                    cancellationReason: input.reason,
                  }
                : {}),
              updatedAt: new Date(),
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1) throw new PurchasingConflictError();
        await audit(database, context, session, {
          action: `purchase.${input.targetStatus}`,
          entityType: "purchaseOrder",
          entityId: order._id,
          summary: `Moved a purchase order to ${input.targetStatus}.`,
          changes: {
            before: { status: order.status },
            after: { status: input.targetStatus },
          },
        });
        return {
          version: input.expectedVersion + 1,
          status: input.targetStatus,
        };
      }),
    );
    if (!result) throw new Error("Purchase order transition did not complete.");
    return result;
  }

  async receive(context: TenantContext, untrusted: ReceivePurchaseOrderInput) {
    requirePermission(context.permissions, "purchase:receive");
    const input = receivePurchaseOrderSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requirePurchasingWriteAccess(database, context, session);
        const receipts = database.collection<StringIdDocument>("goodsReceipts");
        const fingerprint = JSON.stringify(input);
        const existing = await receipts.findOne(
          { tenantId: context.tenantId, idempotencyKey: input.idempotencyKey },
          { session },
        );
        if (existing) {
          if (existing.requestFingerprint !== fingerprint)
            throw new PurchasingConflictError(
              "That receipt request key was used for different input.",
            );
          return {
            id: String(existing._id),
            goodsReceiptNumber: String(existing.goodsReceiptNumber),
            status: String(existing.purchaseStatus),
            replayed: true,
          };
        }
        const orders =
          database.collection<PurchaseOrderDocument>("purchaseOrders");
        const order = await orders.findOne(
          {
            _id: input.purchaseOrderId,
            tenantId: context.tenantId,
            storeId: { $in: [...context.allowedStoreIds] },
          },
          { session },
        );
        if (!order) throw new PurchasingNotFoundError();
        if (order.version !== input.expectedVersion)
          throw new PurchasingConflictError();
        if (!["approved", "partially_received"].includes(order.status))
          throw new PurchasingDomainError(
            "Only approved purchase orders can be received.",
          );
        const requested = new Map(
          input.lines.map((line) => [line.lineId, line.quantity]),
        );
        const inventoryLines: Array<{
          productId: string;
          variantId: string;
          quantity: number;
        }> = [];
        const nextLines = order.lines.map((line) => {
          const quantity = requested.get(line.lineId) ?? 0;
          const remaining = line.orderedQuantity - line.receivedQuantity;
          if (quantity > remaining)
            throw new PurchasingDomainError(
              `Receipt quantity exceeds the remaining quantity for ${line.sku}.`,
            );
          if (quantity > 0)
            inventoryLines.push({
              productId: line.productId,
              variantId: line.variantId,
              quantity,
            });
          return {
            ...line,
            receivedQuantity: line.receivedQuantity + quantity,
          };
        });
        if (inventoryLines.length === 0)
          throw new PurchasingDomainError(
            "Receive at least one remaining item.",
          );
        const goodsReceiptNumber = await nextNumber(
          database,
          context,
          session,
          order.storeId,
          "goods_receipt",
          "GRN",
        );
        const id = createOpaqueId("grn");
        const now = new Date(input.receivedAt);
        await new InventoryService().recordPurchaseReceiptInTransaction(
          database,
          session,
          context,
          {
            purchaseOrderId: order._id,
            purchaseOrderNumber: order.purchaseOrderNumber,
            storeId: order.storeId,
            lines: inventoryLines,
            idempotencyKey: input.idempotencyKey,
            now,
          },
        );
        const complete = nextLines.every(
          (line) => line.receivedQuantity === line.orderedQuantity,
        );
        const status = complete ? "received" : "partially_received";
        const update = await orders.updateOne(
          {
            _id: order._id,
            tenantId: context.tenantId,
            version: input.expectedVersion,
            status: order.status,
          },
          {
            $set: {
              lines: nextLines,
              status,
              updatedAt: now,
              updatedBy: context.userId,
              ...(complete ? { receivedAt: now } : {}),
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1) throw new PurchasingConflictError();
        await receipts.insertOne(
          {
            _id: id,
            tenantId: context.tenantId,
            goodsReceiptNumber,
            purchaseOrderId: order._id,
            purchaseOrderNumber: order.purchaseOrderNumber,
            supplierId: order.supplierId,
            supplierName: order.supplierName,
            storeId: order.storeId,
            lines: order.lines.flatMap((line) => {
              const quantity = requested.get(line.lineId) ?? 0;
              return quantity > 0
                ? [
                    {
                      lineId: line.lineId,
                      productId: line.productId,
                      variantId: line.variantId,
                      productName: line.productName,
                      sku: line.sku,
                      quantity,
                      unitCostMinor: line.unitCostMinor,
                    },
                  ]
                : [];
            }),
            note: input.note,
            receivedAt: now,
            receivedBy: context.userId,
            purchaseStatus: status,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: fingerprint,
            createdAt: now,
          },
          { session },
        );
        await audit(database, context, session, {
          action: "purchase.received",
          entityType: "goodsReceipt",
          entityId: id,
          summary: "Received purchase-order stock into inventory.",
          changes: {
            after: {
              goodsReceiptNumber,
              purchaseOrderId: order._id,
              storeId: order.storeId,
              lineCount: inventoryLines.length,
              status,
            },
          },
        });
        return { id, goodsReceiptNumber, status, replayed: false };
      }),
    );
    if (!result) throw new Error("Purchase receipt did not complete.");
    return result;
  }
}

export class ExpenseService {
  async assertReceiptUploadAllowed(context: TenantContext, expenseId: string) {
    requirePermission(context.permissions, "expense:create");
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const expense = await database
      .collection<ExpenseDocument>("expenses")
      .findOne(
        {
          _id: expenseId,
          tenantId: context.tenantId,
          storeId: { $in: [...context.allowedStoreIds] },
          status: { $in: ["submitted", "approved"] },
        },
        { projection: { _id: 1, receiptUrl: 1 } },
      );
    if (!expense) throw new PurchasingNotFoundError();
    if (expense.receiptUrl)
      throw new PurchasingDomainError(
        "This expense already has a receipt image.",
      );
  }

  async attachReceipt(
    context: TenantContext,
    input: {
      expenseId: string;
      expectedVersion: number;
      upload: CloudinaryProductImageUpload;
    },
  ) {
    requirePermission(context.permissions, "expense:create");
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context, session);
        const expenses = database.collection<ExpenseDocument>("expenses");
        const expense = await expenses.findOne(
          {
            _id: input.expenseId,
            tenantId: context.tenantId,
            storeId: { $in: [...context.allowedStoreIds] },
            status: { $in: ["submitted", "approved"] },
          },
          { session },
        );
        if (!expense) throw new PurchasingNotFoundError();
        if (expense.version !== input.expectedVersion)
          throw new PurchasingConflictError();
        if (expense.receiptUrl)
          throw new PurchasingDomainError(
            "This expense already has a receipt image.",
          );
        const update = await expenses.updateOne(
          {
            _id: input.expenseId,
            tenantId: context.tenantId,
            version: input.expectedVersion,
            receiptUrl: "",
          },
          {
            $set: {
              receiptUrl: input.upload.secureUrl,
              receiptAsset: {
                publicId: input.upload.publicId,
                assetId: input.upload.assetId,
                version: input.upload.version,
                format: input.upload.format,
                bytes: input.upload.bytes,
                width: input.upload.width,
                height: input.upload.height,
              },
              updatedAt: new Date(),
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1) throw new PurchasingConflictError();
        await audit(database, context, session, {
          action: "expense.receipt_attached",
          entityType: "expense",
          entityId: input.expenseId,
          summary: "Attached a receipt image to an expense.",
          changes: { after: { hasReceipt: true, format: input.upload.format } },
        });
        return { version: input.expectedVersion + 1 };
      }),
    );
    if (!result)
      throw new Error("Expense receipt attachment did not complete.");
    return result;
  }

  async create(context: TenantContext, untrusted: CreateExpenseInput) {
    requirePermission(context.permissions, "expense:create");
    const input = createExpenseSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        const profile = await requireWriteAccess(database, context, session);
        await requireStore(database, context, input.storeId, session);
        const expenses = database.collection<ExpenseDocument>("expenses");
        const fingerprint = expenseFingerprint(input);
        const existing = await expenses.findOne(
          { tenantId: context.tenantId, idempotencyKey: input.idempotencyKey },
          { session },
        );
        if (existing) {
          if (existing.requestFingerprint !== fingerprint)
            throw new PurchasingConflictError(
              "That expense request key was used for different input.",
            );
          return {
            id: existing._id,
            expenseNumber: existing.expenseNumber,
            replayed: true,
          };
        }
        const expenseNumber = await nextNumber(
          database,
          context,
          session,
          input.storeId,
          "expense",
          "EXP",
        );
        const id = createOpaqueId("exp");
        const now = new Date();
        const normalizedCategory = normalizeSupplierValue(input.category);
        await database
          .collection<StringIdDocument>("expenseCategories")
          .updateOne(
            { tenantId: context.tenantId, normalizedName: normalizedCategory },
            {
              $set: {
                name: input.category,
                status: "active",
                updatedAt: now,
                updatedBy: context.userId,
              },
              $setOnInsert: {
                _id: createOpaqueId("expcat"),
                tenantId: context.tenantId,
                normalizedName: normalizedCategory,
                createdAt: now,
                createdBy: context.userId,
              },
            },
            { session, upsert: true },
          );
        await expenses.insertOne(
          {
            _id: id,
            tenantId: context.tenantId,
            expenseNumber,
            storeId: input.storeId,
            category: input.category,
            normalizedCategory,
            vendor: input.vendor,
            normalizedVendor: normalizeSupplierValue(input.vendor),
            expenseDate: input.expenseDate,
            amountMinor: input.amountMinor,
            currency: profile.currency,
            notes: input.notes,
            receiptUrl: input.receiptUrl,
            status: "submitted",
            decisionNote: "",
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: fingerprint,
            version: 1,
            createdAt: now,
            updatedAt: now,
            createdBy: context.userId,
            updatedBy: context.userId,
          },
          { session },
        );
        await audit(database, context, session, {
          action: "expense.submitted",
          entityType: "expense",
          entityId: id,
          summary: "Submitted an operational expense.",
          changes: {
            after: {
              expenseNumber,
              storeId: input.storeId,
              category: input.category,
              status: "submitted",
              hasReceipt: Boolean(input.receiptUrl),
            },
          },
        });
        return { id, expenseNumber, replayed: false };
      }),
    );
    if (!result) throw new Error("Expense creation did not complete.");
    return result;
  }

  async decide(context: TenantContext, untrusted: DecideExpenseInput) {
    requirePermission(context.permissions, "expense:approve");
    const input = decideExpenseSchema.parse(untrusted);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context, session);
        const expenses = database.collection<ExpenseDocument>("expenses");
        const expense = await expenses.findOne(
          {
            _id: input.expenseId,
            tenantId: context.tenantId,
            storeId: { $in: [...context.allowedStoreIds] },
          },
          { session },
        );
        if (!expense) throw new PurchasingNotFoundError();
        if (expense.version !== input.expectedVersion)
          throw new PurchasingConflictError();
        if (expense.status !== "submitted")
          throw new PurchasingDomainError(
            "Only submitted expenses can be decided.",
          );
        const update = await expenses.updateOne(
          {
            _id: expense._id,
            tenantId: context.tenantId,
            version: input.expectedVersion,
            status: "submitted",
          },
          {
            $set: {
              status: input.decision,
              decisionNote: input.note,
              decidedAt: new Date(),
              decidedBy: context.userId,
              updatedAt: new Date(),
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1) throw new PurchasingConflictError();
        await audit(database, context, session, {
          action: `expense.${input.decision}`,
          entityType: "expense",
          entityId: expense._id,
          summary: `Marked an operational expense ${input.decision}.`,
          changes: {
            before: { status: "submitted" },
            after: { status: input.decision },
          },
        });
        return { version: input.expectedVersion + 1, status: input.decision };
      }),
    );
    if (!result) throw new Error("Expense decision did not complete.");
    return result;
  }
}
