import {
  AlertTriangle,
  Boxes,
  History,
  PackageCheck,
  PackageX,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  StockAdjustmentDialog,
  StockTransferDialog,
} from "@/components/inventory/inventory-actions";
import { InventoryNav } from "@/components/inventory/inventory-nav";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageContainer, PageStatus } from "@/components/shared/page-container";
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
  demoInventoryOverview,
  demoInventoryStores,
  demoInventoryVariants,
} from "@/modules/inventory/demo-data";
import type { InventoryOverview } from "@/modules/inventory/schemas";
import { hasPermission } from "@/modules/permissions/permissions";
import { InventoryRepository } from "@/server/repositories/inventory";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Inventory" };

function stockBadge(quantity: number, reorderLevel: number) {
  if (quantity <= 0) return <Badge variant="destructive">Out of stock</Badge>;
  if (quantity <= reorderLevel)
    return <Badge variant="warning">Low stock</Badge>;
  return <Badge variant="success">In stock</Badge>;
}

function movementLabel(type: string): string {
  return type
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function InventoryPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  let overview: InventoryOverview = demoInventoryOverview;
  let stores = demoInventoryStores;
  let variants = demoInventoryVariants;
  let activeStoreId: string | null = demoInventoryOverview.store?.id ?? null;
  let isDemo = true;
  let canAdjust = false;
  let canTransfer = false;
  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      const repository = new InventoryRepository();
      [overview, { stores, variants }] = await Promise.all([
        repository.overview(context),
        repository.options(context),
      ]);
      activeStoreId = context.activeStoreId;
      isDemo = false;
      canAdjust = hasPermission(context.permissions, "inventory:adjust");
      canTransfer = hasPermission(context.permissions, "inventory:transfer");
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }
  return (
    <PageContainer>
      <PageStatus
        tone={isDemo ? "demo" : "live"}
        label={isDemo ? "Demo data" : "Live tenant data"}
        detail={
          overview.store
            ? `Viewing ${overview.store.name} · ${overview.store.code}`
            : "Choose or assign an active store"
        }
      />
      <PageHeader
        eyebrow="Operations"
        title="Inventory"
        description="See current stock by store, monitor low quantities, and trace every posted movement."
        actions={
          <>
            <StockTransferDialog
              tenantSlug={tenantSlug}
              stores={stores}
              variants={variants}
              activeStoreId={activeStoreId}
              disabled={isDemo || !canTransfer}
            />
            <StockAdjustmentDialog
              tenantSlug={tenantSlug}
              stores={stores}
              variants={variants}
              activeStoreId={activeStoreId}
              disabled={isDemo || !canAdjust}
            />
          </>
        }
      />
      <InventoryNav tenantSlug={tenantSlug} current="overview" />
      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Inventory summary"
      >
        <MetricCard
          label="Tracked SKUs"
          value={overview.metrics.trackedSkus.toLocaleString()}
          detail="Available at this store"
          icon={Boxes}
        />
        <MetricCard
          label="Units on hand"
          value={overview.metrics.unitsOnHand.toLocaleString()}
          detail="Current ledger projection"
          icon={PackageCheck}
          tone="success"
        />
        <MetricCard
          label="Low stock"
          value={overview.metrics.lowStock.toLocaleString()}
          detail="At or below reorder level"
          icon={AlertTriangle}
          tone="warning"
        />
        <MetricCard
          label="Out of stock"
          value={overview.metrics.outOfStock.toLocaleString()}
          detail="Needs replenishment"
          icon={PackageX}
          tone={overview.metrics.outOfStock > 0 ? "warning" : "muted"}
        />
      </section>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.8fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Stock by SKU</CardTitle>
            <CardDescription>
              Live on-hand quantities and reorder thresholds for{" "}
              {overview.store?.name ?? "the active store"}.
            </CardDescription>
          </CardHeader>
          {overview.rows.length === 0 ? (
            <CardContent className="text-muted-foreground text-sm">
              No tracked products are available at this store.
            </CardContent>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
                    <tr>
                      <th className="px-6 py-3 font-medium">Product</th>
                      <th className="px-4 py-3 font-medium">SKU</th>
                      <th className="px-4 py-3 text-right font-medium">
                        On hand
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Reorder at
                      </th>
                      <th className="px-6 py-3 text-right font-medium">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {overview.rows.map((row) => (
                      <tr key={row.variantId} className="hover:bg-muted/25">
                        <td className="px-6 py-4">
                          <p className="font-medium">{row.productName}</p>
                          <p className="text-muted-foreground mt-0.5 text-xs">
                            {row.variantName}
                          </p>
                        </td>
                        <td className="px-4 py-4 font-mono text-xs">
                          {row.sku}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold tabular-nums">
                          {row.quantity.toLocaleString()}
                        </td>
                        <td className="text-muted-foreground px-4 py-4 text-right tabular-nums">
                          {row.reorderLevel.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {stockBadge(row.quantity, row.reorderLevel)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <CardList className="md:hidden">
                {overview.rows.map((row) => (
                  <CardListItem key={row.variantId}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {row.productName}
                        </p>
                        <p className="text-muted-foreground mt-0.5 truncate font-mono text-xs">
                          {row.sku} · {row.variantName}
                        </p>
                      </div>
                      {stockBadge(row.quantity, row.reorderLevel)}
                    </div>
                    <div className="bg-muted/50 mt-3 grid grid-cols-2 gap-3 rounded-lg p-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">On hand</p>
                        <p className="mt-0.5 font-semibold tabular-nums">
                          {row.quantity.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">
                          Reorder at
                        </p>
                        <p className="mt-0.5 font-semibold tabular-nums">
                          {row.reorderLevel.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </CardListItem>
                ))}
              </CardList>
            </>
          )}
        </Card>
        <Card className="min-w-0 self-start">
          <CardHeader>
            <div className="flex items-center gap-2">
              <History className="text-muted-foreground size-4" />
              <CardTitle>Recent movement</CardTitle>
            </div>
            <CardDescription>
              Latest ledger events at this store.
            </CardDescription>
          </CardHeader>
          {overview.movements.length === 0 ? (
            <CardContent className="text-muted-foreground text-sm">
              No stock movement has been posted yet.
            </CardContent>
          ) : (
            <CardList>
              {overview.movements.map((movement) => (
                <CardListItem key={movement.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {movement.productName}
                      </p>
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">
                        {movementLabel(movement.type)} · {movement.sku}
                      </p>
                    </div>
                    <span
                      className={
                        movement.quantityDelta >= 0
                          ? "text-success-foreground text-sm font-semibold tabular-nums"
                          : "text-destructive text-sm font-semibold tabular-nums"
                      }
                    >
                      {movement.quantityDelta >= 0 ? "+" : ""}
                      {movement.quantityDelta.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-2 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate">
                      {movement.note || "No note"}
                    </span>
                    <time className="shrink-0" dateTime={movement.occurredAt}>
                      {shortDate(movement.occurredAt)}
                    </time>
                  </div>
                </CardListItem>
              ))}
            </CardList>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
