import "server-only";
import type { Filter, Sort } from "mongodb";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";
import type {
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
}
