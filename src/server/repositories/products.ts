import "server-only";
import type { Filter, Sort } from "mongodb";
import { requirePermission } from "@/modules/permissions/permissions";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";
import type { TagColor } from "@/modules/tags/schemas";
import type { ProductOptionGroup } from "@/modules/variants/schemas";
import type { ProductImageItem } from "@/modules/product-images/schemas";
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
  type?: "simple" | "variant" | "service";
  optionGroups?: Array<{
    id: string;
    name: string;
    status: "active" | "archived";
    values: Array<{ id: string; label: string }>;
  }>;
  tagIds?: string[];
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

interface ProductImageDocument {
  _id: string;
  tenantId: string;
  productId: string;
  secureUrl: string;
  altText: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  position: number;
  isPrimary: boolean;
  status: "active" | "archived";
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
    if (query.tag !== "all") filter.tagIds = query.tag;
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
    const primaryImages =
      documents.length === 0
        ? []
        : await db
            .collection<ProductImageDocument>("productImages")
            .find(
              {
                tenantId: context.tenantId,
                productId: { $in: documents.map((document) => document._id) },
                status: "active",
                isPrimary: true,
              },
              {
                projection: {
                  productId: 1,
                  secureUrl: 1,
                  altText: 1,
                  width: 1,
                  height: 1,
                },
              },
            )
            .toArray();
    const primaryImageByProduct = new Map(
      primaryImages.map((image) => [image.productId, image] as const),
    );
    return {
      items: documents.map((document) => ({
        primaryImage: (() => {
          const image = primaryImageByProduct.get(document._id);
          return image
            ? {
                url: image.secureUrl,
                altText: image.altText,
                width: image.width,
                height: image.height,
              }
            : null;
        })(),
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
        tagIds: document.tagIds ?? [],
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

    const [variants, tags, images] = await Promise.all([
      database
        .collection<{
          _id: string;
          tenantId: string;
          productId: string;
          name: string;
          sku: string;
          priceMinor: number;
          currency: string;
          status?: "active" | "archived";
          isDefault?: boolean;
          optionValues?: Array<{ optionId: string; valueId: string }>;
          version?: number;
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
              status: 1,
              isDefault: 1,
              optionValues: 1,
              version: 1,
            },
          },
        )
        .sort({ _id: 1 })
        .toArray(),
      database
        .collection<{
          _id: string;
          tenantId: string;
          name: string;
          color: TagColor;
          status: string;
        }>("tags")
        .find(
          {
            tenantId: context.tenantId,
            _id: { $in: product.tagIds ?? [] },
          },
          { projection: { _id: 1, name: 1, color: 1 } },
        )
        .sort({ name: 1, _id: 1 })
        .toArray(),
      database
        .collection<ProductImageDocument>("productImages")
        .find(
          {
            tenantId: context.tenantId,
            productId,
            status: "active",
          },
          {
            projection: {
              _id: 1,
              secureUrl: 1,
              altText: 1,
              width: 1,
              height: 1,
              format: 1,
              bytes: 1,
              position: 1,
              isPrimary: 1,
              version: 1,
            },
          },
        )
        .sort({ position: 1, _id: 1 })
        .toArray(),
    ]);
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
            .aggregate<{
              _id: { storeId: string; variantId: string };
              quantity: number;
            }>([
              {
                $match: {
                  tenantId: context.tenantId,
                  storeId: { $in: authorizedStoreIds },
                  variantId: { $in: variantIds },
                },
              },
              {
                $group: {
                  _id: { storeId: "$storeId", variantId: "$variantId" },
                  quantity: { $sum: "$quantity" },
                },
              },
            ])
            .toArray(),
    ]);
    const quantityByStore = new Map<string, number>();
    const quantityByVariant = new Map<string, number>();
    for (const quantity of quantities) {
      quantityByStore.set(
        quantity._id.storeId,
        (quantityByStore.get(quantity._id.storeId) ?? 0) + quantity.quantity,
      );
      quantityByVariant.set(
        quantity._id.variantId,
        (quantityByVariant.get(quantity._id.variantId) ?? 0) +
          quantity.quantity,
      );
    }
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
      type: product.type ?? "simple",
      tagIds: product.tagIds ?? [],
      tags: tags.map((tag) => ({
        id: tag._id,
        name: tag.name,
        color: tag.color,
      })),
      status: product.status,
      views: product.views,
      revenueMinor: product.revenueMinor,
      imageTone: product.imageTone,
      primaryImage: (() => {
        const image =
          images.find((candidate) => candidate.isPrimary) ?? images[0];
        return image
          ? {
              url: image.secureUrl,
              altText: image.altText,
              width: image.width,
              height: image.height,
            }
          : null;
      })(),
      version: product.version,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      images: images.map(
        (image) =>
          ({
            id: image._id,
            url: image.secureUrl,
            altText: image.altText,
            width: image.width,
            height: image.height,
            format: image.format,
            bytes: image.bytes,
            isPrimary: image.isPrimary,
            position: image.position,
            version: image.version,
          }) satisfies ProductImageItem,
      ),
      optionGroups: (product.optionGroups ?? []).map((group) => ({
        id: group.id,
        name: group.name,
        status: group.status,
        values: group.values.map((value) => ({ ...value })),
        activeVariantCount: variants.filter(
          (variant) =>
            (variant.status ?? "active") === "active" &&
            (variant.optionValues ?? []).some(
              (value) => value.optionId === group.id,
            ),
        ).length,
      })) satisfies ProductOptionGroup[],
      variants: variants.map((variant) => {
        const resolvedValues = (variant.optionValues ?? []).flatMap(
          (selection) => {
            const group = (product.optionGroups ?? []).find(
              (candidate) => candidate.id === selection.optionId,
            );
            const value = group?.values.find(
              (candidate) => candidate.id === selection.valueId,
            );
            return group && value
              ? [
                  {
                    optionId: group.id,
                    optionName: group.name,
                    valueId: value.id,
                    valueLabel: value.label,
                  },
                ]
              : [];
          },
        );
        return {
          id: variant._id,
          name:
            resolvedValues.length > 0
              ? resolvedValues.map((value) => value.valueLabel).join(" / ")
              : variant.name,
          sku: variant.sku,
          priceMinor: variant.priceMinor,
          currency: variant.currency,
          status: variant.status ?? "active",
          isDefault:
            variant.isDefault ?? variant._id === `${product._id}_default`,
          optionValues: resolvedValues,
          authorizedStock: quantityByVariant.get(variant._id) ?? 0,
          version: variant.version ?? 1,
        };
      }),
      inventory,
    };
  }
}
