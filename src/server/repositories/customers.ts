import "server-only";
import type { Filter, Sort } from "mongodb";
import { requirePermission } from "@/modules/permissions/permissions";
import type {
  CustomerListItem,
  CustomerListQuery,
} from "@/modules/customers/schemas";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

interface CustomerDocument {
  _id: string;
  tenantId: string;
  code: string;
  name: string;
  normalizedName: string;
  company: string;
  email: string;
  normalizedEmail: string;
  phone: string;
  normalizedPhone: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    region: string;
    postalCode: string;
    countryCode: string;
  };
  notes: string;
  status: "active" | "archived";
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class CustomerRepository {
  async list(
    context: TenantContext,
    query: CustomerListQuery,
  ): Promise<{ items: CustomerListItem[]; total: number }> {
    requirePermission(context.permissions, "customer:read");
    const database = await getDatabase();
    const filter: Filter<CustomerDocument> = {
      tenantId: context.tenantId,
      deletedAt: { $exists: false },
    };
    if (query.status !== "all") filter.status = query.status;
    if (query.q) {
      const safe = escapeRegex(query.q);
      filter.$or = [
        { name: { $regex: safe, $options: "i" } },
        { code: { $regex: safe, $options: "i" } },
        { company: { $regex: safe, $options: "i" } },
        { email: { $regex: safe, $options: "i" } },
        { phone: { $regex: safe, $options: "i" } },
        { "address.city": { $regex: safe, $options: "i" } },
      ];
    }
    const sortFields: Record<CustomerListQuery["sort"], string> = {
      name: "normalizedName",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    };
    const sort: Sort = {
      [sortFields[query.sort]]: query.direction === "asc" ? 1 : -1,
      _id: 1,
    };
    const [documents, total] = await Promise.all([
      database
        .collection<CustomerDocument>("customers")
        .find(filter, {
          projection: {
            tenantId: 0,
            normalizedName: 0,
            normalizedEmail: 0,
            normalizedPhone: 0,
          },
        })
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .toArray(),
      database.collection<CustomerDocument>("customers").countDocuments(filter),
    ]);
    return {
      items: documents.map((customer) => ({
        id: customer._id,
        code: customer.code,
        name: customer.name,
        company: customer.company ?? "",
        email: customer.email ?? "",
        phone: customer.phone ?? "",
        address: {
          line1: customer.address?.line1 ?? "",
          line2: customer.address?.line2 ?? "",
          city: customer.address?.city ?? "",
          region: customer.address?.region ?? "",
          postalCode: customer.address?.postalCode ?? "",
          countryCode: customer.address?.countryCode ?? "",
        },
        notes: customer.notes ?? "",
        status: customer.status ?? "active",
        version: customer.version ?? 1,
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString(),
      })),
      total,
    };
  }

  async metrics(context: TenantContext): Promise<{
    total: number;
    active: number;
    archived: number;
    reachable: number;
  }> {
    requirePermission(context.permissions, "customer:read");
    const database = await getDatabase();
    const result = await database
      .collection<CustomerDocument>("customers")
      .aggregate<{
        total: number;
        active: number;
        archived: number;
        reachable: number;
      }>([
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
            reachable: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      {
                        $gt: [{ $strLenCP: { $ifNull: ["$email", ""] } }, 0],
                      },
                      {
                        $gt: [{ $strLenCP: { $ifNull: ["$phone", ""] } }, 0],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ])
      .next();
    return {
      total: result?.total ?? 0,
      active: result?.active ?? 0,
      archived: result?.archived ?? 0,
      reachable: result?.reachable ?? 0,
    };
  }
}
