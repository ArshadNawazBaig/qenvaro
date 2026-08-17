import "server-only";

import { hasPermission } from "@/modules/permissions/permissions";
import type { GlobalSearchResult } from "@/modules/search/schemas";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class GlobalSearchRepository {
  async search(
    context: TenantContext,
    query: string,
  ): Promise<GlobalSearchResult[]> {
    const database = await getDatabase();
    const regex = { $regex: escapeRegex(query), $options: "i" } as const;
    const storeIds = [...context.allowedStoreIds];
    const base = `/app/${context.tenantSlug}`;
    const [products, customers, employees] = await Promise.all([
      hasPermission(context.permissions, "product:read") && storeIds.length > 0
        ? database
            .collection<{
              _id: string;
              tenantId: string;
              name: string;
              sku: string;
              category: string;
              allowedStoreIds?: string[];
            }>("products")
            .find(
              {
                tenantId: context.tenantId,
                deletedAt: { $exists: false },
                $and: [
                  {
                    $or: [
                      { allowedStoreIds: { $exists: false } },
                      { allowedStoreIds: { $size: 0 } },
                      { allowedStoreIds: { $in: storeIds } },
                    ],
                  },
                  {
                    $or: [{ name: regex }, { sku: regex }, { category: regex }],
                  },
                ],
              },
              { projection: { name: 1, sku: 1, category: 1 } },
            )
            .sort({ name: 1, _id: 1 })
            .limit(5)
            .toArray()
        : Promise.resolve([]),
      hasPermission(context.permissions, "customer:read")
        ? database
            .collection<{
              _id: string;
              tenantId: string;
              name: string;
              code: string;
              company?: string;
              email?: string;
            }>("customers")
            .find(
              {
                tenantId: context.tenantId,
                deletedAt: { $exists: false },
                $or: [
                  { name: regex },
                  { code: regex },
                  { company: regex },
                  { email: regex },
                ],
              },
              { projection: { name: 1, code: 1, company: 1, email: 1 } },
            )
            .sort({ name: 1, _id: 1 })
            .limit(5)
            .toArray()
        : Promise.resolve([]),
      (hasPermission(context.permissions, "employee:read") ||
        hasPermission(context.permissions, "employee:readOwn")) &&
      storeIds.length > 0
        ? database
            .collection<{
              _id: string;
              tenantId: string;
              employeeCode: string;
              name: string;
              jobTitle: string;
              department: string;
              workEmail?: string;
              storeIds: string[];
              linkedUserId?: string;
            }>("employees")
            .find(
              {
                tenantId: context.tenantId,
                ...(hasPermission(context.permissions, "employee:read")
                  ? { storeIds: { $in: storeIds } }
                  : { linkedUserId: context.userId }),
                $or: [
                  { name: regex },
                  { employeeCode: regex },
                  { jobTitle: regex },
                  { department: regex },
                  { workEmail: regex },
                ],
              },
              {
                projection: {
                  name: 1,
                  employeeCode: 1,
                  jobTitle: 1,
                  department: 1,
                },
              },
            )
            .sort({ name: 1, _id: 1 })
            .limit(5)
            .toArray()
        : Promise.resolve([]),
    ]);

    const normalizedQuery = query.toLocaleLowerCase();
    const settings = [
      {
        id: "business",
        title: "Business settings",
        description: "Currency, locale, timezone, and tax defaults",
        href: `${base}/settings/business`,
        allowed: hasPermission(context.permissions, "settings:read"),
      },
      {
        id: "stores",
        title: "Store settings",
        description: "Locations, codes, and store access",
        href: `${base}/settings/stores`,
        allowed: hasPermission(context.permissions, "store:read"),
      },
      {
        id: "members",
        title: "Members and roles",
        description: "Team access, invitations, and permissions",
        href: `${base}/settings/members`,
        allowed: hasPermission(context.permissions, "member:read"),
      },
      {
        id: "security",
        title: "Security and data",
        description: "Account protection and data controls",
        href: `${base}/settings/security`,
        allowed: hasPermission(context.permissions, "settings:read"),
      },
    ].filter(
      (setting) =>
        setting.allowed &&
        `${setting.title} ${setting.description}`
          .toLocaleLowerCase()
          .includes(normalizedQuery),
    );

    return [
      ...products.map((product) => ({
        id: `product:${product._id}`,
        kind: "product" as const,
        title: product.name,
        description: `${product.sku} · ${product.category}`,
        href: `${base}/products/${product._id}`,
      })),
      ...customers.map((customer) => ({
        id: `customer:${customer._id}`,
        kind: "customer" as const,
        title: customer.name,
        description: [customer.code, customer.company || customer.email]
          .filter(Boolean)
          .join(" · "),
        href: `${base}/customers?q=${encodeURIComponent(customer.code)}`,
      })),
      ...employees.map((employee) => ({
        id: `employee:${employee._id}`,
        kind: "employee" as const,
        title: employee.name,
        description: [employee.employeeCode, employee.jobTitle]
          .filter(Boolean)
          .join(" · "),
        href: `${base}/employees?q=${encodeURIComponent(employee.employeeCode)}`,
      })),
      ...settings.slice(0, 5).map((setting) => ({
        id: `setting:${setting.id}`,
        kind: "setting" as const,
        title: setting.title,
        description: setting.description,
        href: setting.href,
      })),
    ];
  }
}
