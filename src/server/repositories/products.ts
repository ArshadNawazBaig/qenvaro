import "server-only";
import type { Document, Filter, Sort } from "mongodb";
import { defaultCurrency, safeCurrency } from "@/config/currencies";
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
  ProductStoreOption,
} from "@/modules/products/schemas";

interface ProductDocument {
  _id: string;
  tenantId: string;
  name: string;
  subtitle: string;
  description?: string;
  sku: string;
  barcode?: string | null;
  normalizedSku: string;
  slug: string;
  priceMinor: number;
  costMinor?: number;
  currency: string;
  stock: number | null;
  reorderLevel: number;
  category: string;
  unitId?: string;
  type?: "simple" | "variant" | "service";
  inventoryTracking?: boolean;
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

interface StoreDocument {
  _id: string;
  tenantId: string;
  code: string;
  name: string;
  status: string;
  deletedAt?: Date;
}

export interface ProductCsvExportRow {
  name: string;
  sku: string;
  subtitle: string;
  category: string;
  priceMinor: number;
  currency: string;
  reorderLevel: number;
  status: "draft" | "active" | "archived";
  tagNames: string[];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildProductStoreScope(
  context: TenantContext,
  selectedStoreId?: string,
): Filter<ProductDocument> {
  const authorizedStoreIds = [...context.allowedStoreIds];
  const selectedStoreIds = selectedStoreId
    ? authorizedStoreIds.includes(selectedStoreId)
      ? [selectedStoreId]
      : []
    : authorizedStoreIds;
  return selectedStoreIds.length === 0
    ? { _id: { $in: [] } }
    : {
        $or: [
          { allowedStoreIds: { $exists: false } },
          { allowedStoreIds: { $size: 0 } },
          { allowedStoreIds: { $in: selectedStoreIds } },
        ],
      };
}

function buildProductFilter(
  context: TenantContext,
  query: ProductListQuery,
): Filter<ProductDocument> {
  const filter: Filter<ProductDocument> = {
    tenantId: context.tenantId,
    deletedAt: { $exists: false },
  };
  filter.$and = [
    buildProductStoreScope(
      context,
      query.store === "all" ? undefined : query.store,
    ),
  ];
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
  return filter;
}

function selectedStoreIds(
  context: TenantContext,
  selectedStoreId?: string,
): string[] {
  const authorized = [...context.allowedStoreIds];
  if (!selectedStoreId) return authorized;
  return authorized.includes(selectedStoreId) ? [selectedStoreId] : [];
}

function authorizedStockStages(
  context: TenantContext,
  selectedStoreId?: string,
): Document[] {
  const storeIds = selectedStoreIds(context, selectedStoreId);
  return [
    {
      $lookup: {
        from: "productVariants",
        let: { productId: "$_id", productTenantId: "$tenantId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$tenantId", "$$productTenantId"] },
                  { $eq: ["$productId", "$$productId"] },
                  { $eq: [{ $ifNull: ["$deletedAt", null] }, null] },
                ],
              },
            },
          },
          { $project: { _id: 1 } },
        ],
        as: "_authorizedVariants",
      },
    },
    {
      $lookup: {
        from: "inventoryLevels",
        let: {
          variantIds: "$_authorizedVariants._id",
          productTenantId: "$tenantId",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$tenantId", "$$productTenantId"] },
                  { $in: ["$storeId", storeIds] },
                  { $in: ["$variantId", "$$variantIds"] },
                ],
              },
            },
          },
          { $group: { _id: null, quantity: { $sum: "$quantity" } } },
        ],
        as: "_authorizedInventory",
      },
    },
    {
      $set: {
        stock: {
          $cond: [
            { $eq: ["$stock", null] },
            null,
            {
              $cond: [
                { $eq: [{ $size: "$_authorizedVariants" }, 0] },
                "$stock",
                {
                  $ifNull: [
                    { $arrayElemAt: ["$_authorizedInventory.quantity", 0] },
                    0,
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    { $unset: ["_authorizedVariants", "_authorizedInventory"] },
  ];
}

function authorizedStockMatch(query: ProductListQuery): Document[] {
  if (query.stock === "out") return [{ $match: { stock: 0 } }];
  if (query.stock === "service") return [{ $match: { stock: null } }];
  if (query.stock === "in-stock") return [{ $match: { stock: { $gt: 0 } } }];
  if (query.stock === "low")
    return [
      {
        $match: {
          $expr: {
            $and: [
              { $gt: ["$stock", 0] },
              { $lte: ["$stock", "$reorderLevel"] },
            ],
          },
        },
      },
    ];
  return [];
}

function authorizedRevenueStages(
  context: TenantContext,
  selectedStoreId?: string,
): Document[] {
  const storeIds = selectedStoreIds(context, selectedStoreId);
  const revenueLookup = (from: "sales" | "returns", as: string) => ({
    $lookup: {
      from,
      let: { productId: "$_id", productTenantId: "$tenantId" },
      pipeline: [
        {
          $match: {
            status: "completed",
            $expr: {
              $and: [
                { $eq: ["$tenantId", "$$productTenantId"] },
                { $in: ["$storeId", storeIds] },
              ],
            },
          },
        },
        { $unwind: "$lines" },
        { $match: { $expr: { $eq: ["$lines.productId", "$$productId"] } } },
        {
          $group: {
            _id: null,
            amountMinor: { $sum: "$lines.lineTotalMinor" },
          },
        },
      ],
      as,
    },
  });
  return [
    revenueLookup("sales", "_authorizedSalesRevenue"),
    revenueLookup("returns", "_authorizedReturnedRevenue"),
    {
      $set: {
        revenueMinor: {
          $subtract: [
            {
              $ifNull: [
                {
                  $arrayElemAt: ["$_authorizedSalesRevenue.amountMinor", 0],
                },
                0,
              ],
            },
            {
              $ifNull: [
                {
                  $arrayElemAt: ["$_authorizedReturnedRevenue.amountMinor", 0],
                },
                0,
              ],
            },
          ],
        },
      },
    },
    { $unset: ["_authorizedSalesRevenue", "_authorizedReturnedRevenue"] },
  ];
}

function buildProductSort(query: ProductListQuery): Sort {
  const sortFields: Record<ProductListQuery["sort"], keyof ProductDocument> = {
    name: "name",
    price: "priceMinor",
    stock: "stock",
    revenue: "revenueMinor",
    updatedAt: "updatedAt",
  };
  return {
    [sortFields[query.sort]]: query.direction === "asc" ? 1 : -1,
    _id: 1,
  };
}

export class ProductRepository {
  async storeOptions(context: TenantContext): Promise<ProductStoreOption[]> {
    requirePermission(context.permissions, "product:read");
    const database = await getDatabase();
    const stores = await database
      .collection<StoreDocument>("stores")
      .find(
        {
          tenantId: context.tenantId,
          _id: { $in: [...context.allowedStoreIds] },
          status: "active",
          deletedAt: { $exists: false },
        },
        { projection: { code: 1, name: 1 } },
      )
      .sort({ name: 1, _id: 1 })
      .toArray();
    return stores.map((store) => ({
      id: String(store._id),
      code: store.code,
      name: store.name,
    }));
  }

  async list(
    context: TenantContext,
    query: ProductListQuery,
  ): Promise<{ items: ProductListItem[]; total: number }> {
    requirePermission(context.permissions, "product:read");
    const db = await getDatabase();
    const collection = db.collection<ProductDocument>("products");
    const filter = buildProductFilter(context, query);
    const sort = buildProductSort(query);
    const [result] = await collection
      .aggregate<{
        items: ProductDocument[];
        total: Array<{ value: number }>;
      }>([
        { $match: filter },
        ...authorizedStockStages(
          context,
          query.store === "all" ? undefined : query.store,
        ),
        ...authorizedStockMatch(query),
        ...(query.sort === "revenue"
          ? authorizedRevenueStages(
              context,
              query.store === "all" ? undefined : query.store,
            )
          : []),
        {
          $facet: {
            items: [
              { $sort: sort },
              { $skip: (query.page - 1) * query.pageSize },
              { $limit: query.pageSize },
              { $unset: ["tenantId", "createdBy", "updatedBy"] },
            ],
            total: [{ $limit: 100_001 }, { $count: "value" }],
          },
        },
      ])
      .toArray();
    const documents = result?.items ?? [];
    const total = result?.total[0]?.value ?? 0;
    const productIds = documents.map((document) => document._id);
    const storeIds = selectedStoreIds(
      context,
      query.store === "all" ? undefined : query.store,
    );
    const [primaryImages, saleRevenue, returnedRevenue] = await Promise.all([
      documents.length === 0
        ? Promise.resolve([])
        : db
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
            .toArray(),
      productIds.length === 0 || query.sort === "revenue"
        ? Promise.resolve([])
        : db
            .collection("sales")
            .aggregate<{ _id: string; amountMinor: number }>([
              {
                $match: {
                  tenantId: context.tenantId,
                  storeId: { $in: storeIds },
                  status: "completed",
                },
              },
              { $unwind: "$lines" },
              { $match: { "lines.productId": { $in: productIds } } },
              {
                $group: {
                  _id: "$lines.productId",
                  amountMinor: { $sum: "$lines.lineTotalMinor" },
                },
              },
            ])
            .toArray(),
      productIds.length === 0 || query.sort === "revenue"
        ? Promise.resolve([])
        : db
            .collection("returns")
            .aggregate<{ _id: string; amountMinor: number }>([
              {
                $match: {
                  tenantId: context.tenantId,
                  storeId: { $in: storeIds },
                  status: "completed",
                },
              },
              { $unwind: "$lines" },
              { $match: { "lines.productId": { $in: productIds } } },
              {
                $group: {
                  _id: "$lines.productId",
                  amountMinor: { $sum: "$lines.lineTotalMinor" },
                },
              },
            ])
            .toArray(),
    ]);
    const primaryImageByProduct = new Map(
      primaryImages.map((image) => [image.productId, image] as const),
    );
    const saleRevenueByProduct = new Map(
      saleRevenue.map((item) => [item._id, item.amountMinor] as const),
    );
    const returnedRevenueByProduct = new Map(
      returnedRevenue.map((item) => [item._id, item.amountMinor] as const),
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
        revenueMinor:
          query.sort === "revenue"
            ? document.revenueMinor
            : (saleRevenueByProduct.get(document._id) ?? 0) -
              (returnedRevenueByProduct.get(document._id) ?? 0),
        imageTone: document.imageTone,
      })),
      total,
    };
  }

  async exportRows(
    context: TenantContext,
    query: ProductListQuery,
    maximumRows: number,
  ): Promise<{ rows: ProductCsvExportRow[]; exceedsLimit: boolean }> {
    requirePermission(context.permissions, "product:read");
    const database = await getDatabase();
    const products = await database
      .collection<ProductDocument>("products")
      .aggregate<ProductDocument>([
        { $match: buildProductFilter(context, query) },
        ...authorizedStockStages(
          context,
          query.store === "all" ? undefined : query.store,
        ),
        ...authorizedStockMatch(query),
        ...(query.sort === "revenue"
          ? authorizedRevenueStages(
              context,
              query.store === "all" ? undefined : query.store,
            )
          : []),
        { $sort: buildProductSort(query) },
        { $limit: maximumRows + 1 },
        {
          $project: {
            name: 1,
            sku: 1,
            subtitle: 1,
            category: 1,
            priceMinor: 1,
            currency: 1,
            reorderLevel: 1,
            status: 1,
            tagIds: 1,
          },
        },
      ])
      .toArray();
    const selected = products.slice(0, maximumRows);
    const tagIds = [
      ...new Set(selected.flatMap((product) => product.tagIds ?? [])),
    ];
    const tags =
      tagIds.length === 0
        ? []
        : await database
            .collection<{
              _id: string;
              tenantId: string;
              name: string;
            }>("tags")
            .find(
              { tenantId: context.tenantId, _id: { $in: tagIds } },
              { projection: { name: 1 } },
            )
            .toArray();
    const tagNameById = new Map(tags.map((tag) => [tag._id, tag.name]));
    return {
      rows: selected.map((product) => ({
        name: product.name,
        sku: product.sku,
        subtitle: product.subtitle,
        category: product.category,
        priceMinor: product.priceMinor,
        currency: product.currency,
        reorderLevel: product.reorderLevel,
        status: product.status,
        tagNames: (product.tagIds ?? []).flatMap((tagId) => {
          const name = tagNameById.get(tagId);
          return name ? [name] : [];
        }),
      })),
      exceedsLimit: products.length > maximumRows,
    };
  }

  async categories(context: TenantContext): Promise<string[]> {
    requirePermission(context.permissions, "product:read");
    const database = await getDatabase();
    return database
      .collection<ProductDocument>("products")
      .distinct("category", {
        tenantId: context.tenantId,
        ...buildProductStoreScope(context),
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
    const [[result], profile, [salesRevenue], [returnsRevenue]] =
      await Promise.all([
        database
          .collection<ProductDocument>("products")
          .aggregate<{
            total: number;
            active: number;
            attention: number;
          }>([
            {
              $match: {
                tenantId: context.tenantId,
                ...buildProductStoreScope(context),
                deletedAt: { $exists: false },
              },
            },
            ...authorizedStockStages(context),
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                active: {
                  $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
                },
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
              },
            },
            {
              $project: {
                _id: 0,
                total: 1,
                active: 1,
                attention: 1,
              },
            },
          ])
          .toArray(),
        database
          .collection<{ currency?: string }>("tenantProfiles")
          .findOne(
            { tenantId: context.tenantId },
            { projection: { currency: 1 } },
          ),
        database
          .collection("sales")
          .aggregate<{ amountMinor: number }>([
            {
              $match: {
                tenantId: context.tenantId,
                storeId: { $in: [...context.allowedStoreIds] },
                status: "completed",
              },
            },
            { $group: { _id: null, amountMinor: { $sum: "$totalMinor" } } },
          ])
          .toArray(),
        database
          .collection("returns")
          .aggregate<{ amountMinor: number }>([
            {
              $match: {
                tenantId: context.tenantId,
                storeId: { $in: [...context.allowedStoreIds] },
                status: "completed",
              },
            },
            { $group: { _id: null, amountMinor: { $sum: "$totalMinor" } } },
          ])
          .toArray(),
      ]);
    const currency = safeCurrency(profile?.currency ?? defaultCurrency);
    const revenueMinor =
      (salesRevenue?.amountMinor ?? 0) - (returnsRevenue?.amountMinor ?? 0);
    return result
      ? { ...result, revenueMinor, currency }
      : {
          total: 0,
          active: 0,
          attention: 0,
          revenueMinor: 0,
          currency,
        };
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
          ...buildProductStoreScope(context),
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

    const [variants, tags, images, unit, [saleRevenue], [returnedRevenue]] =
      await Promise.all([
        database
          .collection<{
            _id: string;
            tenantId: string;
            productId: string;
            name: string;
            sku: string;
            barcode?: string | null;
            priceMinor: number;
            costMinor?: number;
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
                barcode: 1,
                priceMinor: 1,
                costMinor: 1,
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
        product.unitId
          ? database
              .collection<{
                _id: string;
                tenantId: string;
                name: string;
                symbol: string;
              }>("units")
              .findOne(
                { _id: product.unitId, tenantId: context.tenantId },
                { projection: { _id: 1, name: 1, symbol: 1 } },
              )
          : Promise.resolve(null),
        database
          .collection("sales")
          .aggregate<{ amountMinor: number }>([
            {
              $match: {
                tenantId: context.tenantId,
                storeId: { $in: [...context.allowedStoreIds] },
                status: "completed",
              },
            },
            { $unwind: "$lines" },
            { $match: { "lines.productId": productId } },
            {
              $group: {
                _id: null,
                amountMinor: { $sum: "$lines.lineTotalMinor" },
              },
            },
          ])
          .toArray(),
        database
          .collection("returns")
          .aggregate<{ amountMinor: number }>([
            {
              $match: {
                tenantId: context.tenantId,
                storeId: { $in: [...context.allowedStoreIds] },
                status: "completed",
              },
            },
            { $unwind: "$lines" },
            { $match: { "lines.productId": productId } },
            {
              $group: {
                _id: null,
                amountMinor: { $sum: "$lines.lineTotalMinor" },
              },
            },
          ])
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
      description: product.description ?? "",
      barcode: product.barcode ?? null,
      costMinor: product.costMinor ?? 0,
      inventoryTracking: product.inventoryTracking !== false,
      unitId: product.unitId ?? null,
      unit: unit
        ? { id: unit._id, name: unit.name, symbol: unit.symbol }
        : null,
      tagIds: product.tagIds ?? [],
      tags: tags.map((tag) => ({
        id: tag._id,
        name: tag.name,
        color: tag.color,
      })),
      status: product.status,
      views: product.views,
      revenueMinor:
        (saleRevenue?.amountMinor ?? 0) - (returnedRevenue?.amountMinor ?? 0),
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
          barcode: variant.barcode ?? null,
          priceMinor: variant.priceMinor,
          costMinor: variant.costMinor ?? null,
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
