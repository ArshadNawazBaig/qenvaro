import "server-only";
import type { Filter, Sort } from "mongodb";
import { requirePermission } from "@/modules/permissions/permissions";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";
import type {
  ProductDetail,
  ProductListItem,
  ProductListQuery,
} from "@/modules/products/schemas";

interface ProductDocument {
  _id: string;
  tenantId: string;
  name: string;
  subtitle: string;
  sku: string;
  normalizedSku: string;
  slug: string;
  priceMinor: number;
  currency: string;
  stock: number | null;
  reorderLevel: number;
  category: string;
  status: "draft" | "active" | "archived";
  views: number;
  revenueMinor: number;
  imageTone: ProductListItem["imageTone"];
  allowedStoreIds: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt?: Date;
  version: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class ProductRepository {
  async list(
    context: TenantContext,
    query: ProductListQuery,
  ): Promise<{ items: ProductListItem[]; total: number }> {
    requirePermission(context.permissions, "product:read");
    const db = await getDatabase();
    const collection = db.collection<ProductDocument>("products");
    const filter: Filter<ProductDocument> = {
      tenantId: context.tenantId,
      deletedAt: { $exists: false },
    };
    if (query.status !== "all") filter.status = query.status;
    if (query.category !== "all") filter.category = query.category;
    if (query.q) {
      const safe = escapeRegex(query.q);
      filter.$or = [
        { name: { $regex: safe, $options: "i" } },
        { sku: { $regex: safe, $options: "i" } },
        { slug: { $regex: safe, $options: "i" } },
      ];
    }
    if (query.stock === "out") filter.stock = 0;
    else if (query.stock === "service") filter.stock = null;
    else if (query.stock === "in-stock") filter.stock = { $gt: 0 };
    else if (query.stock === "low")
      filter.$expr = {
        $and: [{ $gt: ["$stock", 0] }, { $lte: ["$stock", "$reorderLevel"] }],
      };
    const sortFields: Record<ProductListQuery["sort"], keyof ProductDocument> =
      {
        name: "name",
        price: "priceMinor",
        stock: "stock",
        revenue: "revenueMinor",
        updatedAt: "updatedAt",
      };
    const sort: Sort = {
      [sortFields[query.sort]]: query.direction === "asc" ? 1 : -1,
      _id: 1,
    };
    const [documents, total] = await Promise.all([
      collection
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .project<Omit<ProductDocument, "tenantId">>({
          tenantId: 0,
          createdBy: 0,
          updatedBy: 0,
        })
        .toArray(),
      collection.countDocuments(filter, { limit: 100_001 }),
    ]);
    return {
      items: documents.map((document) => ({
        id: document._id,
        name: document.name,
        subtitle: document.subtitle,
        sku: document.sku,
        slug: document.slug,
        priceMinor: document.priceMinor,
        currency: document.currency,
        stock: document.stock,
        reorderLevel: document.reorderLevel,
        category: document.category,
        status: document.status,
        views: document.views,
        revenueMinor: document.revenueMinor,
        imageTone: document.imageTone,
      })),
      total,
    };
  }

  async categories(context: TenantContext): Promise<string[]> {
    requirePermission(context.permissions, "product:read");
    const database = await getDatabase();
    return database
      .collection<ProductDocument>("products")
      .distinct("category", {
        tenantId: context.tenantId,
        deletedAt: { $exists: false },
      });
  }

  async metrics(context: TenantContext): Promise<{
    total: number;
    active: number;
    attention: number;
    revenueMinor: number;
    currency: string;
  }> {
    requirePermission(context.permissions, "product:read");
    const database = await getDatabase();
    const [result] = await database
      .collection<ProductDocument>("products")
      .aggregate<{
        total: number;
        active: number;
        attention: number;
        revenueMinor: number;
        currency: string;
      }>([
        {
          $match: { tenantId: context.tenantId, deletedAt: { $exists: false } },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
            attention: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$stock", null] },
                      { $lte: ["$stock", "$reorderLevel"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            revenueMinor: { $sum: "$revenueMinor" },
            currency: { $first: "$currency" },
          },
        },
        {
          $project: {
            _id: 0,
            total: 1,
            active: 1,
            attention: 1,
            revenueMinor: 1,
            currency: 1,
          },
        },
      ])
      .toArray();
    return (
      result ?? {
        total: 0,
        active: 0,
        attention: 0,
        revenueMinor: 0,
        currency: "USD",
      }
    );
  }

  async detail(
    context: TenantContext,
    productId: string,
  ): Promise<ProductDetail | null> {
    requirePermission(context.permissions, "product:read");
    const database = await getDatabase();
    const product = await database
      .collection<ProductDocument>("products")
      .findOne(
        {
          _id: productId,
          tenantId: context.tenantId,
          deletedAt: { $exists: false },
        },
        {
          projection: {
            tenantId: 0,
            createdBy: 0,
            updatedBy: 0,
            deletedAt: 0,
          },
        },
      );
    if (!product) return null;

    const variants = await database
      .collection<{
        _id: string;
        tenantId: string;
        productId: string;
        name: string;
        sku: string;
        priceMinor: number;
        currency: string;
      }>("productVariants")
      .find(
        { tenantId: context.tenantId, productId },
        {
          projection: {
            _id: 1,
            name: 1,
            sku: 1,
            priceMinor: 1,
            currency: 1,
          },
        },
      )
      .sort({ _id: 1 })
      .toArray();
    const variantIds = variants.map((variant) => variant._id);
    const productStoreIds = new Set(product.allowedStoreIds ?? []);
    const authorizedStoreIds = [...context.allowedStoreIds].filter(
      (storeId) => productStoreIds.size === 0 || productStoreIds.has(storeId),
    );
    const [stores, quantities] = await Promise.all([
      database
        .collection<{
          _id: string;
          tenantId: string;
          name: string;
          code: string;
          status: string;
        }>("stores")
        .find(
          {
            tenantId: context.tenantId,
            _id: { $in: authorizedStoreIds },
            status: "active",
          },
          { projection: { _id: 1, name: 1, code: 1 } },
        )
        .sort({ name: 1, _id: 1 })
        .toArray(),
      variantIds.length === 0 || authorizedStoreIds.length === 0
        ? Promise.resolve([])
        : database
            .collection<{
              tenantId: string;
              storeId: string;
              variantId: string;
              quantity: number;
            }>("inventoryLevels")
            .aggregate<{ _id: string; quantity: number }>([
              {
                $match: {
                  tenantId: context.tenantId,
                  storeId: { $in: authorizedStoreIds },
                  variantId: { $in: variantIds },
                },
              },
              { $group: { _id: "$storeId", quantity: { $sum: "$quantity" } } },
            ])
            .toArray(),
    ]);
    const quantityByStore = new Map(
      quantities.map((quantity) => [quantity._id, quantity.quantity]),
    );
    const inventory = stores.map((store) => ({
      storeId: store._id,
      storeName: store.name,
      storeCode: store.code,
      quantity: quantityByStore.get(store._id) ?? 0,
    }));
    const authorizedStock =
      product.stock === null
        ? null
        : variantIds.length === 0
          ? product.stock
          : inventory.reduce((sum, item) => sum + item.quantity, 0);

    return {
      id: product._id,
      name: product.name,
      subtitle: product.subtitle,
      sku: product.sku,
      slug: product.slug,
      priceMinor: product.priceMinor,
      currency: product.currency,
      stock: authorizedStock,
      reorderLevel: product.reorderLevel,
      category: product.category,
      status: product.status,
      views: product.views,
      revenueMinor: product.revenueMinor,
      imageTone: product.imageTone,
      version: product.version,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      variants: variants.map((variant) => ({
        id: variant._id,
        name: variant.name,
        sku: variant.sku,
        priceMinor: variant.priceMinor,
        currency: variant.currency,
      })),
      inventory,
    };
  }
}
