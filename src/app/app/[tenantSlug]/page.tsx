import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  DashboardView,
  type DashboardCatalogSnapshot,
  type DashboardInventorySnapshot,
} from "@/components/dashboard/dashboard-view";
import { env } from "@/config/env";
import { getDemoDashboard } from "@/modules/dashboard/demo-data";
import { dashboardQuerySchema } from "@/modules/dashboard/schemas";
import { hasPermission } from "@/modules/permissions/permissions";
import { DashboardRepository } from "@/server/repositories/dashboard";
import { InventoryRepository } from "@/server/repositories/inventory";
import { ProductRepository } from "@/server/repositories/products";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ tenantSlug }, untrustedQuery] = await Promise.all([
    params,
    searchParams,
  ]);
  const query = dashboardQuerySchema.parse({ range: untrustedQuery.range });
  let isDemo = true;
  let dashboard = getDemoDashboard(query.range);
  let catalog: DashboardCatalogSnapshot | null = { total: 16, active: 12 };
  let inventory: DashboardInventorySnapshot | null = {
    lowStock: 3,
    outOfStock: 2,
  };

  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      const canViewCatalog = hasPermission(context.permissions, "product:read");
      const canViewInventory = hasPermission(
        context.permissions,
        "inventory:read",
      );
      const [liveDashboard, catalogMetrics, inventoryOverview] =
        await Promise.all([
          new DashboardRepository().overview(context, query),
          canViewCatalog
            ? new ProductRepository().metrics(context)
            : Promise.resolve(null),
          canViewInventory
            ? new InventoryRepository().overview(context)
            : Promise.resolve(null),
        ]);
      dashboard = liveDashboard;
      catalog = catalogMetrics
        ? { total: catalogMetrics.total, active: catalogMetrics.active }
        : null;
      inventory = inventoryOverview
        ? {
            lowStock: inventoryOverview.metrics.lowStock,
            outOfStock: inventoryOverview.metrics.outOfStock,
          }
        : null;
      isDemo = false;
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }

  return (
    <DashboardView
      tenantSlug={tenantSlug}
      dashboard={dashboard}
      catalog={catalog}
      inventory={inventory}
      isDemo={isDemo}
    />
  );
}
