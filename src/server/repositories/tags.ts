import "server-only";
import type { Filter, Sort } from "mongodb";
import { requirePermission } from "@/modules/permissions/permissions";
import type {
  TagListItem,
  TagListQuery,
  TagOption,
  TagColor,
} from "@/modules/tags/schemas";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

interface TagDocument {
  _id: string;
  tenantId: string;
  name: string;
  normalizedName: string;
  slug: string;
  description: string;
  color: TagColor;
  status: "active" | "archived";
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

interface TagWithCounts extends TagDocument {
  activeProductCount: number;
  totalProductCount: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class TagRepository {
  async list(
    context: TenantContext,
    query: TagListQuery,
  ): Promise<{ items: TagListItem[]; total: number }> {
    requirePermission(context.permissions, "product:read");
    const database = await getDatabase();
    const filter: Filter<TagDocument> = {
      tenantId: context.tenantId,
      deletedAt: { $exists: false },
    };
    if (query.status !== "all") filter.status = query.status;
    if (query.q) {
      const safe = escapeRegex(query.q);
      filter.$or = [
        { name: { $regex: safe, $options: "i" } },
        { description: { $regex: safe, $options: "i" } },
        { slug: { $regex: safe, $options: "i" } },
      ];
    }
    const sortFields: Record<TagListQuery["sort"], string> = {
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
        .collection<TagDocument>("tags")
        .aggregate<TagWithCounts>([
          { $match: filter },
          {
            $lookup: {
              from: "products",
              let: { tagId: "$_id" },
              pipeline: [
                {
                  $match: {
                    tenantId: context.tenantId,
                    deletedAt: { $exists: false },
                    $expr: {
                      $in: ["$$tagId", { $ifNull: ["$tagIds", []] }],
                    },
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
          { $unset: ["assignmentCounts", "tenantId", "normalizedName"] },
          { $sort: sort },
          { $skip: (query.page - 1) * query.pageSize },
          { $limit: query.pageSize },
        ])
        .toArray(),
      database.collection<TagDocument>("tags").countDocuments(filter),
    ]);
    return {
      items: documents.map((document) => ({
        id: document._id,
        name: document.name,
        slug: document.slug,
        description: document.description,
        color: document.color,
        status: document.status,
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
    const [tags, assignedProducts] = await Promise.all([
      database
        .collection<TagDocument>("tags")
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
        tagIds: { $exists: true, $ne: [] },
        status: { $in: ["active", "draft"] },
        deletedAt: { $exists: false },
      }),
    ]);
    return {
      total: tags?.total ?? 0,
      active: tags?.active ?? 0,
      archived: tags?.archived ?? 0,
      assignedProducts,
    };
  }

  async activeOptions(context: TenantContext): Promise<TagOption[]> {
    requirePermission(context.permissions, "product:read");
    const database = await getDatabase();
    const tags = await database
      .collection<TagDocument>("tags")
      .find(
        {
          tenantId: context.tenantId,
          status: "active",
          deletedAt: { $exists: false },
        },
        { projection: { _id: 1, name: 1, color: 1 } },
      )
      .sort({ name: 1, _id: 1 })
      .toArray();
    return tags.map((tag) => ({
      id: tag._id,
      name: tag.name,
      color: tag.color,
    }));
  }
}
