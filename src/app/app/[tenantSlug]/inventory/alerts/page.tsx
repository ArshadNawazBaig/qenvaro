import { AlertTriangle, BellRing, PackageX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MetricCard } from "@/components/dashboard/metric-card";
import { InventoryNav } from "@/components/inventory/inventory-nav";
import { LowStockAlertPreferencesForm } from "@/components/inventory/inventory-settings";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardList,
  CardListItem,
  CardTitle,
} from "@/components/ui/card";
import { env } from "@/config/env";
import {
  demoInventoryStores,
  demoLowStockAlertPreferences,
  demoLowStockAlerts,
} from "@/modules/inventory/demo-data";
import type {
  LowStockAlertItem,
  LowStockAlertPreferences,
} from "@/modules/inventory/schemas";
import { hasPermission } from "@/modules/permissions/permissions";
import { InventoryRepository } from "@/server/repositories/inventory";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Low-stock alerts" };

export default async function LowStockAlertsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  let preferences: LowStockAlertPreferences = demoLowStockAlertPreferences;
  let items: LowStockAlertItem[] = demoLowStockAlerts;
  let store: { id: string; code: string; name: string } | null =
    demoInventoryStores[0] ?? null;
  let isDemo = true;
  let canManage = false;
  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      const result = await new InventoryRepository().lowStockAlerts(context);
      preferences = result.preferences;
      items = result.items;
      store = result.store;
      isDemo = false;
      canManage = hasPermission(context.permissions, "settings:manage");
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }
  const lowCount = items.filter((item) => item.severity === "low").length;
  const outCount = items.filter((item) => item.severity === "out").length;
  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isDemo ? "warning" : "success"}>
          {isDemo ? "Demo data" : "Live tenant data"}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {store
            ? `Attention queue for ${store.name} · ${store.code}`
            : "Choose or assign an active store"}
        </span>
      </div>
      <PageHeader
        eyebrow="Inventory"
        parentHref={`/app/${tenantSlug}/inventory`}
        title="Low-stock alerts"
        description="Prioritize replenishment using live store quantities and each product's reorder level."
      />
      <InventoryNav tenantSlug={tenantSlug} current="alerts" />
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Alert summary">
        <MetricCard
          label="Alert policy"
          value={preferences.enabled ? "On" : "Off"}
          detail="Tenant-wide in-app policy"
          icon={BellRing}
          tone={preferences.enabled ? "success" : "muted"}
        />
        <MetricCard
          label="Low stock"
          value={lowCount.toLocaleString()}
          detail="At or below reorder level"
          icon={AlertTriangle}
          tone="warning"
        />
        <MetricCard
          label="Out of stock"
          value={outCount.toLocaleString()}
          detail="Zero or negative on hand"
          icon={PackageX}
          tone={outCount > 0 ? "warning" : "muted"}
        />
      </section>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.7fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Attention queue</CardTitle>
            <CardDescription>
              Live inventory exceptions for the active store, ordered by
              severity.
            </CardDescription>
          </CardHeader>
          {!preferences.enabled ? (
            <CardContent className="text-muted-foreground text-sm">
              Inventory alerts are currently disabled. Enable the policy to see
              low and out-of-stock products here.
            </CardContent>
          ) : items.length === 0 ? (
            <CardContent className="text-muted-foreground text-sm">
              No products match the enabled alert severities at this store.
            </CardContent>
          ) : (
            <CardList>
              {items.map((item) => (
                <CardListItem key={`${item.storeId}:${item.variantId}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/app/${tenantSlug}/products/${item.productId}`}
                          className="truncate text-sm font-semibold hover:underline"
                        >
                          {item.productName}
                        </Link>
                        <Badge
                          variant={
                            item.severity === "out" ? "destructive" : "warning"
                          }
                        >
                          {item.severity === "out"
                            ? "Out of stock"
                            : "Low stock"}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-1 truncate font-mono text-xs">
                        {item.sku} · {item.variantName}
                      </p>
                    </div>
                    <div className="bg-muted/50 grid grid-cols-2 gap-5 rounded-lg px-4 py-2.5 text-sm sm:shrink-0">
                      <div>
                        <p className="text-muted-foreground text-xs">On hand</p>
                        <p className="mt-0.5 font-semibold tabular-nums">
                          {item.quantity.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">
                          Reorder at
                        </p>
                        <p className="mt-0.5 font-semibold tabular-nums">
                          {item.reorderLevel.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardListItem>
              ))}
            </CardList>
          )}
        </Card>
        <Card className="min-w-0 self-start">
          <CardHeader>
            <CardTitle>Alert policy</CardTitle>
            <CardDescription>
              Applies tenant-wide; the queue still respects each member&apos;s
              assigned stores.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LowStockAlertPreferencesForm
              tenantSlug={tenantSlug}
              preferences={preferences}
              disabled={isDemo || !canManage}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
