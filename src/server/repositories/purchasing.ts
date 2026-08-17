import "server-only";
import type { Filter } from "mongodb";
import { requirePermission } from "@/modules/permissions/permissions";
import type { OperationsReportQuery } from "@/modules/reports/operations-schemas";
import type {
  ExpenseListItem,
  ExpenseListQuery,
  PurchaseOrderListItem,
  PurchasingReferenceData,
  SupplierListItem,
  SupplierListQuery,
} from "@/modules/purchasing/schemas";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";
import { TenantNotFoundError } from "@/server/tenancy/context";

interface SupplierDocument extends Omit<SupplierListItem, "id" | "createdAt"> {
  _id: string;
  tenantId: string;
  normalizedName: string;
  createdAt: Date;
}

interface PurchaseOrderDocument extends Omit<
  PurchaseOrderListItem,
  "id" | "storeName" | "createdAt"
> {
  _id: string;
  tenantId: string;
  requestFingerprint: string;
  idempotencyKey: string;
  createdAt: Date;
}

interface ExpenseDocument extends Omit<
  ExpenseListItem,
  "id" | "storeName" | "createdAt"
> {
  _id: string;
  tenantId: string;
  normalizedCategory: string;
  normalizedVendor: string;
  requestFingerprint: string;
  idempotencyKey: string;
  createdAt: Date;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface OperationsSummary {
  approvedExpenseMinor: number;
  submittedExpenseMinor: number;
  receivedPurchaseMinor: number;
  openPurchaseMinor: number;
  expenseCount: number;
  receiptCount: number;
  currency: string;
  expenseCategories: { name: string; amountMinor: number }[];
  stores: { id: string; name: string }[];
  range: OperationsReportQuery["range"];
  selectedStoreId: string;
  periodStart: string;
  asOf: string;
}

export class PurchasingRepository {
  async suppliers(context: TenantContext, query: SupplierListQuery) {
    requirePermission(context.permissions, "supplier:read");
    const filter: Filter<SupplierDocument> = { tenantId: context.tenantId };
    if (query.status !== "all") filter.status = query.status;
    if (query.q) {
      const safe = escapeRegex(query.q);
      filter.$or = [
        { name: { $regex: safe, $options: "i" } },
        { supplierCode: { $regex: safe, $options: "i" } },
        { contactName: { $regex: safe, $options: "i" } },
        { email: { $regex: safe, $options: "i" } },
      ];
    }
    const database = await getDatabase();
    const [documents, total] = await Promise.all([
      database
        .collection<SupplierDocument>("suppliers")
        .find(filter, {
          projection: { tenantId: 0, normalizedName: 0 },
        })
        .sort({ normalizedName: 1, _id: 1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .toArray(),
      database.collection<SupplierDocument>("suppliers").countDocuments(filter),
    ]);
    return {
      items: documents.map((supplier) => ({
        id: supplier._id,
        supplierCode: supplier.supplierCode,
        name: supplier.name,
        contactName: supplier.contactName ?? "",
        email: supplier.email ?? "",
        phone: supplier.phone ?? "",
        address: supplier.address ?? "",
        taxNumber: supplier.taxNumber ?? "",
        paymentTerms: supplier.paymentTerms ?? "",
        notes: supplier.notes ?? "",
        status: supplier.status,
        version: supplier.version,
        createdAt: supplier.createdAt.toISOString(),
      })),
      total,
    };
  }

  async referenceData(
    context: TenantContext,
  ): Promise<PurchasingReferenceData> {
    requirePermission(context.permissions, "purchase:read");
    const database = await getDatabase();
    const [profile, stores, suppliers, products] = await Promise.all([
      database
        .collection<{ currency: string }>("tenantProfiles")
        .findOne(
          { tenantId: context.tenantId },
          { projection: { currency: 1 } },
        ),
      database
        .collection<{ _id: string; code: string; name: string }>("stores")
        .find(
          {
            tenantId: context.tenantId,
            _id: { $in: [...context.allowedStoreIds] },
            status: "active",
            deletedAt: { $exists: false },
          },
          { projection: { code: 1, name: 1 } },
        )
        .sort({ name: 1 })
        .limit(100)
        .toArray(),
      database
        .collection<SupplierDocument>("suppliers")
        .find(
          { tenantId: context.tenantId, status: "active" },
          { projection: { supplierCode: 1, name: 1 } },
        )
        .sort({ normalizedName: 1 })
        .limit(500)
        .toArray(),
      database
        .collection<{
          _id: string;
          name: string;
          costMinor?: number;
          allowedStoreIds?: string[];
        }>("products")
        .find(
          {
            tenantId: context.tenantId,
            inventoryTracking: { $ne: false },
            status: { $ne: "archived" },
            deletedAt: { $exists: false },
            $or: [
              { allowedStoreIds: { $exists: false } },
              { allowedStoreIds: { $size: 0 } },
              { allowedStoreIds: { $in: [...context.allowedStoreIds] } },
            ],
          },
          { projection: { name: 1, costMinor: 1 } },
        )
        .sort({ name: 1 })
        .limit(500)
        .toArray(),
    ]);
    if (!profile)
      throw new Error("Purchasing workspace profile is unavailable.");
    const productMap = new Map(
      products.map((product) => [product._id, product]),
    );
    const variants = await database
      .collection<{
        _id: string;
        productId: string;
        name: string;
        sku: string;
        costMinor?: number;
      }>("productVariants")
      .find(
        {
          tenantId: context.tenantId,
          productId: { $in: [...productMap.keys()] },
          status: { $ne: "archived" },
          deletedAt: { $exists: false },
        },
        { projection: { productId: 1, name: 1, sku: 1, costMinor: 1 } },
      )
      .sort({ sku: 1 })
      .limit(500)
      .toArray();
    return {
      currency: profile.currency,
      stores: stores.map((store) => ({
        id: store._id,
        code: store.code,
        name: store.name,
      })),
      expenseCategories: [],
      suppliers: suppliers.map((supplier) => ({
        id: supplier._id,
        supplierCode: supplier.supplierCode,
        name: supplier.name,
      })),
      variants: variants.flatMap((variant) => {
        const product = productMap.get(variant.productId);
        return product
          ? [
              {
                id: variant._id,
                productId: variant.productId,
                productName: product.name,
                name: variant.name,
                sku: variant.sku,
                costMinor: variant.costMinor ?? product.costMinor ?? 0,
              },
            ]
          : [];
      }),
    };
  }

  async expenseReferenceData(
    context: TenantContext,
  ): Promise<PurchasingReferenceData> {
    requirePermission(context.permissions, "expense:read");
    const database = await getDatabase();
    const [profile, stores, expenseCategories] = await Promise.all([
      database
        .collection<{ currency: string }>("tenantProfiles")
        .findOne(
          { tenantId: context.tenantId },
          { projection: { currency: 1 } },
        ),
      database
        .collection<{ _id: string; code: string; name: string }>("stores")
        .find(
          {
            tenantId: context.tenantId,
            _id: { $in: [...context.allowedStoreIds] },
            status: "active",
            deletedAt: { $exists: false },
          },
          { projection: { code: 1, name: 1 } },
        )
        .sort({ name: 1 })
        .limit(100)
        .toArray(),
      database
        .collection<{ _id: string; name: string }>("expenseCategories")
        .find(
          { tenantId: context.tenantId, status: "active" },
          { projection: { name: 1 } },
        )
        .sort({ normalizedName: 1, _id: 1 })
        .limit(100)
        .toArray(),
    ]);
    if (!profile) throw new Error("Expense workspace profile is unavailable.");
    return {
      currency: profile.currency,
      stores: stores.map((store) => ({
        id: store._id,
        code: store.code,
        name: store.name,
      })),
      expenseCategories: expenseCategories.map((category) => ({
        id: category._id,
        name: category.name,
      })),
      suppliers: [],
      variants: [],
    };
  }

  async purchaseOrders(
    context: TenantContext,
  ): Promise<PurchaseOrderListItem[]> {
    requirePermission(context.permissions, "purchase:read");
    const database = await getDatabase();
    const [orders, stores] = await Promise.all([
      database
        .collection<PurchaseOrderDocument>("purchaseOrders")
        .find(
          {
            tenantId: context.tenantId,
            storeId: { $in: [...context.allowedStoreIds] },
          },
          {
            projection: {
              tenantId: 0,
              idempotencyKey: 0,
              requestFingerprint: 0,
            },
          },
        )
        .sort({ createdAt: -1, _id: -1 })
        .limit(100)
        .toArray(),
      database
        .collection<{ _id: string; name: string }>("stores")
        .find(
          {
            tenantId: context.tenantId,
            _id: { $in: [...context.allowedStoreIds] },
          },
          { projection: { name: 1 } },
        )
        .toArray(),
    ]);
    const storeMap = new Map(stores.map((store) => [store._id, store.name]));
    return orders.map((order) => ({
      id: order._id,
      purchaseOrderNumber: order.purchaseOrderNumber,
      supplierId: order.supplierId,
      supplierCode: order.supplierCode,
      supplierName: order.supplierName,
      storeId: order.storeId,
      storeName: storeMap.get(order.storeId) ?? "Authorized store",
      expectedDeliveryDate: order.expectedDeliveryDate,
      currency: order.currency,
      status: order.status,
      lines: order.lines,
      subtotalMinor: order.subtotalMinor,
      taxMinor: order.taxMinor,
      totalMinor: order.totalMinor,
      version: order.version,
      createdAt: order.createdAt.toISOString(),
    }));
  }

  async expenses(context: TenantContext, query: ExpenseListQuery) {
    requirePermission(context.permissions, "expense:read");
    const filter: Filter<ExpenseDocument> = {
      tenantId: context.tenantId,
      storeId: { $in: [...context.allowedStoreIds] },
    };
    if (query.status !== "all") filter.status = query.status;
    if (query.store !== "all") {
      if (!context.allowedStoreIds.has(query.store))
        return { items: [], total: 0 };
      filter.storeId = query.store;
    }
    if (query.q) {
      const safe = escapeRegex(query.q);
      filter.$or = [
        { expenseNumber: { $regex: safe, $options: "i" } },
        { vendor: { $regex: safe, $options: "i" } },
        { category: { $regex: safe, $options: "i" } },
      ];
    }
    const database = await getDatabase();
    const [documents, total, stores] = await Promise.all([
      database
        .collection<ExpenseDocument>("expenses")
        .find(filter, {
          projection: { tenantId: 0, idempotencyKey: 0, requestFingerprint: 0 },
        })
        .sort({ expenseDate: -1, createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .toArray(),
      database.collection<ExpenseDocument>("expenses").countDocuments(filter),
      database
        .collection<{ _id: string; name: string }>("stores")
        .find(
          {
            tenantId: context.tenantId,
            _id: { $in: [...context.allowedStoreIds] },
          },
          { projection: { name: 1 } },
        )
        .toArray(),
    ]);
    const storeMap = new Map(stores.map((store) => [store._id, store.name]));
    return {
      items: documents.map((expense) => ({
        id: expense._id,
        expenseNumber: expense.expenseNumber,
        storeId: expense.storeId,
        storeName: storeMap.get(expense.storeId) ?? "Authorized store",
        category: expense.category,
        vendor: expense.vendor,
        expenseDate: expense.expenseDate,
        amountMinor: expense.amountMinor,
        currency: expense.currency,
        notes: expense.notes,
        receiptUrl: expense.receiptUrl,
        status: expense.status,
        decisionNote: expense.decisionNote,
        version: expense.version,
        createdAt: expense.createdAt.toISOString(),
      })),
      total,
    };
  }

  async operationsSummary(
    context: TenantContext,
    query: OperationsReportQuery = { range: "90d", store: "all" },
    now = new Date(),
  ): Promise<OperationsSummary> {
    requirePermission(context.permissions, "report:read");
    const database = await getDatabase();
    const allowedStoreIds = [...context.allowedStoreIds];
    if (query.store !== "all" && !allowedStoreIds.includes(query.store))
      throw new TenantNotFoundError();
    const selectedStoreIds =
      query.store === "all" ? allowedStoreIds : [query.store];
    const days = query.range === "30d" ? 30 : query.range === "365d" ? 365 : 90;
    const periodStart = new Date(now.getTime() - days * 86_400_000);
    const dateString = periodStart.toISOString().slice(0, 10);
    const [profile, stores, expenseRows, receipts, openPurchases] =
      await Promise.all([
        database
          .collection<{ currency: string }>("tenantProfiles")
          .findOne(
            { tenantId: context.tenantId },
            { projection: { currency: 1 } },
          ),
        database
          .collection<{ _id: string; name: string }>("stores")
          .find(
            {
              tenantId: context.tenantId,
              _id: { $in: allowedStoreIds },
            },
            { projection: { name: 1 } },
          )
          .toArray(),
        database
          .collection<ExpenseDocument>("expenses")
          .aggregate<{ status: string; amountMinor: number; category: string }>(
            [
              {
                $match: {
                  tenantId: context.tenantId,
                  storeId: { $in: selectedStoreIds },
                  expenseDate: { $gte: dateString },
                  status: { $in: ["approved", "submitted"] },
                },
              },
              { $project: { status: 1, amountMinor: 1, category: 1 } },
            ],
          )
          .toArray(),
        database
          .collection("goodsReceipts")
          .find(
            {
              tenantId: context.tenantId,
              storeId: { $in: selectedStoreIds },
              receivedAt: { $gte: periodStart, $lte: now },
            },
            { projection: { lines: 1 } },
          )
          .limit(1_000)
          .toArray(),
        database
          .collection<PurchaseOrderDocument>("purchaseOrders")
          .find(
            {
              tenantId: context.tenantId,
              storeId: { $in: selectedStoreIds },
              createdAt: { $gte: periodStart, $lte: now },
              status: {
                $in: ["draft", "submitted", "approved", "partially_received"],
              },
            },
            { projection: { totalMinor: 1 } },
          )
          .limit(1_000)
          .toArray(),
      ]);
    if (!profile) throw new Error("Operations report profile is unavailable.");
    const categoryMap = new Map<string, number>();
    for (const expense of expenseRows)
      if (expense.status === "approved")
        categoryMap.set(
          expense.category,
          (categoryMap.get(expense.category) ?? 0) + expense.amountMinor,
        );
    return {
      approvedExpenseMinor: expenseRows
        .filter((row) => row.status === "approved")
        .reduce((sum, row) => sum + row.amountMinor, 0),
      submittedExpenseMinor: expenseRows
        .filter((row) => row.status === "submitted")
        .reduce((sum, row) => sum + row.amountMinor, 0),
      receivedPurchaseMinor: receipts.reduce(
        (sum, receipt) =>
          sum +
          (Array.isArray(receipt.lines)
            ? receipt.lines.reduce(
                (
                  lineSum: number,
                  line: { quantity?: number; unitCostMinor?: number },
                ) => lineSum + (line.quantity ?? 0) * (line.unitCostMinor ?? 0),
                0,
              )
            : 0),
        0,
      ),
      openPurchaseMinor: openPurchases.reduce(
        (sum, order) => sum + order.totalMinor,
        0,
      ),
      expenseCount: expenseRows.length,
      receiptCount: receipts.length,
      currency: profile.currency,
      expenseCategories: [...categoryMap.entries()]
        .map(([name, amountMinor]) => ({ name, amountMinor }))
        .sort((a, b) => b.amountMinor - a.amountMinor)
        .slice(0, 8),
      stores: stores.map((store) => ({ id: store._id, name: store.name })),
      range: query.range,
      selectedStoreId: query.store,
      periodStart: periodStart.toISOString(),
      asOf: now.toISOString(),
    };
  }
}
