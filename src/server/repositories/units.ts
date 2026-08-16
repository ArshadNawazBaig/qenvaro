import "server-only";
import type { Filter, Sort } from "mongodb";
import { requirePermission } from "@/modules/permissions/permissions";
import type {
  UnitListItem,
  UnitListQuery,
  UnitOption,
} from "@/modules/units/schemas";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

interface UnitDocument {
  _id: string;
  tenantId: string;
  name: string;
  normalizedName: string;
  symbol: string;
  normalizedSymbol: string;
  slug: string;
  description: string;
  status: "active" | "archived";
  isDefault: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

interface UnitWithCounts extends UnitDocument {
  activeProductCount: number;
  totalProductCount: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class UnitRepository {
  async list(
    context: TenantContext,
    query: UnitListQuery,
  ): Promise<{ items: UnitListItem[]; total: number }> {
    requirePermission(context.permissions, "product:read");
    const database = await getDatabase();
    const filter: Filter<UnitDocument> = {
      tenantId: context.tenantId,
      deletedAt: { $exists: false },
    };
    if (query.status !== "all") filter.status = query.status;
    if (query.q) {
      const safe = escapeRegex(query.q);
      filter.$or = [
        { name: { $regex: safe, $options: "i" } },
        { symbol: { $regex: safe, $options: "i" } },
        { description: { $regex: safe, $options: "i" } },
        { slug: { $regex: safe, $options: "i" } },
      ];
    }
    const sortFields: Record<UnitListQuery["sort"], string> = {
      name: "name",
      products: "activeProductCount",
      updatedAt: "updatedAt",
    };
    const sort: Sort = {
      [sortFields[query.sort]]: query.direction === "asc" ? 1 : -1,
      _id: 1,
    };
    const [documents, total] = await Promise.all([
      database
        .collection<UnitDocument>("units")
        .aggregate<UnitWithCounts>([
          { $match: filter },
          {
            $lookup: {
              from: "products",
              let: { unitId: "$_id" },
              pipeline: [
                {
                  $match: {
                    tenantId: context.tenantId,
                    deletedAt: { $exists: false },
                    $expr: { $eq: ["$unitId", "$$unitId"] },
                  },
                },
                {
                  $group: {
                    _id: null,
                    totalProductCount: { $sum: 1 },
                    activeProductCount: {
                      $sum: {
                        $cond: [
                          { $in: ["$status", ["active", "draft"]] },
                          1,
                          0,
                        ],
                      },
                    },
                  },
                },
              ],
              as: "assignmentCounts",
            },
          },
          {
            $set: {
              totalProductCount: {
                $ifNull: [
                  { $arrayElemAt: ["$assignmentCounts.totalProductCount", 0] },
                  0,
                ],
              },
              activeProductCount: {
                $ifNull: [
                  { $arrayElemAt: ["$assignmentCounts.activeProductCount", 0] },
                  0,
                ],
              },
            },
          },
          {
            $unset: [
              "assignmentCounts",
              "tenantId",
              "normalizedName",
              "normalizedSymbol",
            ],
          },
          { $sort: sort },
          { $skip: (query.page - 1) * query.pageSize },
          { $limit: query.pageSize },
        ])
        .toArray(),
      database.collection<UnitDocument>("units").countDocuments(filter),
    ]);
    return {
      items: documents.map((document) => ({
        id: document._id,
        name: document.name,
        symbol: document.symbol,
        slug: document.slug,
        description: document.description,
        status: document.status,
        isDefault: document.isDefault,
        activeProductCount: document.activeProductCount,
        totalProductCount: document.totalProductCount,
        version: document.version,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
      })),
      total,
    };
  }

  async metrics(context: TenantContext): Promise<{
    total: number;
    active: number;
    archived: number;
    assignedProducts: number;
  }> {
    requirePermission(context.permissions, "product:read");
    const database = await getDatabase();
    const [units, assignedProducts] = await Promise.all([
      database
        .collection<UnitDocument>("units")
        .aggregate<{ total: number; active: number; archived: number }>([
          {
            $match: {
              tenantId: context.tenantId,
              deletedAt: { $exists: false },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: {
                $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
              },
              archived: {
                $sum: { $cond: [{ $eq: ["$status", "archived"] }, 1, 0] },
              },
            },
          },
        ])
        .next(),
      database.collection("products").countDocuments({
        tenantId: context.tenantId,
        unitId: { $type: "string" },
        status: { $in: ["active", "draft"] },
        deletedAt: { $exists: false },
      }),
    ]);
    return {
      total: units?.total ?? 0,
      active: units?.active ?? 0,
      archived: units?.archived ?? 0,
      assignedProducts,
    };
  }

  async activeOptions(context: TenantContext): Promise<UnitOption[]> {
    requirePermission(context.permissions, "product:read");
    const database = await getDatabase();
    const units = await database
      .collection<UnitDocument>("units")
      .find(
        {
          tenantId: context.tenantId,
          status: "active",
          deletedAt: { $exists: false },
        },
        { projection: { _id: 1, name: 1, symbol: 1 } },
      )
      .sort({ isDefault: -1, name: 1, _id: 1 })
      .limit(1_000)
      .toArray();
    return units.map((unit) => ({
      id: unit._id,
      name: unit.name,
      symbol: unit.symbol,
    }));
  }
}
