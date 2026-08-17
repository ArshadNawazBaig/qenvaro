import "server-only";
import { safeCurrency } from "@/config/currencies";
import { requirePermission } from "@/modules/permissions/permissions";
import {
  type SaleCatalogQuery,
  type SalePaymentMethod,
  type SaleReceipt,
  type SaleReceiptLine,
  type SaleWorkspace,
} from "@/modules/sales/schemas";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

interface SaleWorkspaceProfile {
  tenantId: string;
  businessName: string;
  currency: string;
  locale: string;
  timezone: string;
}

interface SaleWorkspaceStore {
  _id: string;
  tenantId: string;
  code: string;
  name: string;
}

interface CatalogAggregateItem {
  _id: string;
  productId: string;
  name: string;
  sku: string;
  priceMinor: number;
  currency: string;
  product: {
    _id: string;
    name: string;
    sku: string;
    category: string;
    currency: string;
    type?: "simple" | "variant" | "service";
    inventoryTracking?: boolean;
    taxRateBps?: number;
  };
}

interface CatalogAggregateResult {
  items: CatalogAggregateItem[];
  metadata: Array<{ total: number }>;
}

interface ReceiptSaleDocument {
  _id: string;
  tenantId: string;
  storeId: string;
  receiptNumber: string;
  customer: { id: string; code: string; name: string } | null;
  status: "completed";
  currency: string;
  lines: SaleReceiptLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  netTotalMinor: number;
  totalMinor: number;
  tenderedMinor: number;
  changeMinor: number;
  note: string;
  completedAt: Date;
}

interface ReceiptPaymentDocument {
  _id: string;
  tenantId: string;
  saleId: string;
  method: SalePaymentMethod;
  tenderedMinor: number;
  appliedMinor: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeLocale(value: string): string {
  try {
    new Intl.NumberFormat(value).format(1);
    return value;
  } catch {
    return "en-US";
  }
}

function safeTimezone(value: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    return "UTC";
  }
}

export class SaleRepository {
  async workspace(
    context: TenantContext,
    query: SaleCatalogQuery,
  ): Promise<SaleWorkspace> {
    requirePermission(context.permissions, "sale:create");
    const database = await getDatabase();
    const activeStoreId = context.activeStoreId;
    const [profile, store] = await Promise.all([
      database.collection<SaleWorkspaceProfile>("tenantProfiles").findOne(
        { tenantId: context.tenantId },
        {
          projection: {
            businessName: 1,
            currency: 1,
            locale: 1,
            timezone: 1,
          },
        },
      ),
      activeStoreId
        ? database.collection<SaleWorkspaceStore>("stores").findOne(
            {
              _id: activeStoreId,
              tenantId: context.tenantId,
              status: "active",
              deletedAt: { $exists: false },
            },
            { projection: { code: 1, name: 1 } },
          )
        : Promise.resolve(null),
    ]);
    if (!profile) throw new Error("The sale workspace profile is missing.");
    const currency = safeCurrency(profile.currency);
    const locale = safeLocale(profile.locale);
    if (!store)
      return {
        store: null,
        currency,
        locale,
        catalog: {
          items: [],
          total: 0,
          page: query.page,
          pageSize: query.pageSize,
        },
        customers: [],
      };

    const safe = escapeRegex(query.q);
    const searchMatch = query.q
      ? {
          $or: [
            { sku: { $regex: safe, $options: "i" } },
            { "product.name": { $regex: safe, $options: "i" } },
            { "product.sku": { $regex: safe, $options: "i" } },
          ],
        }
      : {};
    const aggregate = await database
      .collection("productVariants")
      .aggregate<CatalogAggregateResult>([
        {
          $match: {
            tenantId: context.tenantId,
            status: "active",
            deletedAt: { $exists: false },
          },
        },
        {
          $lookup: {
            from: "products",
            let: { productId: "$productId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$productId"] },
                  tenantId: context.tenantId,
                  status: "active",
                  deletedAt: { $exists: false },
                  $or: [
                    { allowedStoreIds: { $exists: false } },
                    { allowedStoreIds: { $size: 0 } },
                    { allowedStoreIds: String(store._id) },
                  ],
                },
              },
              {
                $project: {
                  name: 1,
                  sku: 1,
                  category: 1,
                  currency: 1,
                  type: 1,
                  inventoryTracking: 1,
                  taxRateBps: 1,
                },
              },
            ],
            as: "product",
          },
        },
        { $unwind: "$product" },
        { $match: searchMatch },
        { $sort: { "product.name": 1, sku: 1, _id: 1 } },
        {
          $facet: {
            items: [
              { $skip: (query.page - 1) * query.pageSize },
              { $limit: query.pageSize },
            ],
            metadata: [{ $count: "total" }],
          },
        },
      ])
      .next();
    const catalogItems = aggregate?.items ?? [];
    const trackedVariantIds = catalogItems
      .filter(
        (item) =>
          item.product.inventoryTracking !== false &&
          item.product.type !== "service",
      )
      .map((item) => String(item._id));
    const [levels, customers] = await Promise.all([
      trackedVariantIds.length === 0
        ? Promise.resolve([])
        : database
            .collection<{
              tenantId: string;
              storeId: string;
              variantId: string;
              quantity: number;
              version?: number;
            }>("inventoryLevels")
            .find(
              {
                tenantId: context.tenantId,
                storeId: String(store._id),
                variantId: { $in: trackedVariantIds },
              },
              { projection: { variantId: 1, quantity: 1, version: 1 } },
            )
            .toArray(),
      database
        .collection<{
          _id: string;
          tenantId: string;
          code: string;
          name: string;
          company?: string;
        }>("customers")
        .find(
          {
            tenantId: context.tenantId,
            status: "active",
            deletedAt: { $exists: false },
          },
          { projection: { code: 1, name: 1, company: 1 } },
        )
        .sort({ normalizedName: 1, _id: 1 })
        .limit(100)
        .toArray(),
    ]);
    const levelByVariant = new Map(
      levels.map((level) => [level.variantId, level]),
    );
    return {
      store: {
        id: String(store._id),
        code: store.code,
        name: store.name,
      },
      currency,
      locale,
      catalog: {
        total: aggregate?.metadata[0]?.total ?? 0,
        page: query.page,
        pageSize: query.pageSize,
        items: catalogItems.map((item) => {
          const inventoryTracking =
            item.product.inventoryTracking !== false &&
            item.product.type !== "service";
          const level = levelByVariant.get(String(item._id));
          return {
            productId: item.productId,
            variantId: String(item._id),
            productName: item.product.name,
            variantName: item.name,
            sku: item.sku,
            category: item.product.category,
            priceMinor: item.priceMinor,
            taxRateBps:
              Number.isInteger(item.product.taxRateBps) &&
              Number(item.product.taxRateBps) >= 0 &&
              Number(item.product.taxRateBps) <= 10_000
                ? Number(item.product.taxRateBps)
                : 0,
            currency,
            inventoryTracking,
            quantity: inventoryTracking ? (level?.quantity ?? 0) : null,
            levelVersion: inventoryTracking ? (level?.version ?? 0) : 0,
          };
        }),
      },
      customers: customers.map((customer) => ({
        id: String(customer._id),
        code: customer.code,
        name: customer.name,
        company: customer.company ?? "",
      })),
    };
  }

  async receipt(
    context: TenantContext,
    saleId: string,
  ): Promise<SaleReceipt | null> {
    requirePermission(context.permissions, "sale:read");
    const database = await getDatabase();
    const sale = await database
      .collection<ReceiptSaleDocument>("sales")
      .findOne({
        _id: saleId,
        tenantId: context.tenantId,
        storeId: { $in: [...context.allowedStoreIds] },
        status: "completed",
      });
    if (!sale) return null;
    const [store, profile, receipt, payments] = await Promise.all([
      database
        .collection<SaleWorkspaceStore>("stores")
        .findOne(
          { _id: sale.storeId, tenantId: context.tenantId },
          { projection: { code: 1, name: 1 } },
        ),
      database.collection<SaleWorkspaceProfile>("tenantProfiles").findOne(
        { tenantId: context.tenantId },
        {
          projection: {
            businessName: 1,
            locale: 1,
            currency: 1,
            timezone: 1,
          },
        },
      ),
      database.collection("receipts").findOne({
        tenantId: context.tenantId,
        saleId: sale._id,
        receiptNumber: sale.receiptNumber,
        status: "issued",
        $or: [{ entityType: "sale" }, { entityType: { $exists: false } }],
      }),
      database
        .collection<ReceiptPaymentDocument>("salePayments")
        .find(
          { tenantId: context.tenantId, saleId: sale._id },
          { projection: { method: 1, tenderedMinor: 1, appliedMinor: 1 } },
        )
        .sort({ recordedAt: 1, _id: 1 })
        .toArray(),
    ]);
    if (!store || !profile || !receipt) return null;
    return {
      id: String(sale._id),
      receiptNumber: sale.receiptNumber,
      businessName: profile.businessName,
      status: "completed",
      store: { id: String(store._id), code: store.code, name: store.name },
      customer: sale.customer,
      currency: safeCurrency(sale.currency || profile.currency),
      locale: safeLocale(profile.locale),
      timezone: safeTimezone(profile.timezone),
      lines: sale.lines,
      payments: payments.map((payment) => ({
        id: String(payment._id),
        method: payment.method,
        tenderedMinor: payment.tenderedMinor,
        appliedMinor: payment.appliedMinor,
      })),
      subtotalMinor: sale.subtotalMinor,
      discountMinor: sale.discountMinor,
      taxMinor: sale.taxMinor,
      netTotalMinor: sale.netTotalMinor,
      totalMinor: sale.totalMinor,
      tenderedMinor: sale.tenderedMinor,
      changeMinor: sale.changeMinor,
      note: sale.note,
      completedAt: sale.completedAt.toISOString(),
    };
  }
}
