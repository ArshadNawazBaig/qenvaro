import {
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Check,
  CircleAlert,
  PackageCheck,
  PackageX,
  Percent,
  ReceiptText,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { DashboardPeriodSelect } from "@/components/dashboard/dashboard-period-select";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SalesOverview } from "@/components/dashboard/sales-overview";
import { PageContainer, PageStatus } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardList,
  CardListItem,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type {
  DashboardActivityItem,
  DashboardOverview,
} from "@/modules/dashboard/schemas";

export interface DashboardCatalogSnapshot {
  total: number;
  active: number;
}

export interface DashboardInventorySnapshot {
  lowStock: number;
  outOfStock: number;
}

function money(amountMinor: number, dashboard: DashboardOverview): string {
  return formatMoney(
    { amountMinor, currency: dashboard.currency },
    dashboard.locale,
  );
}

function SalesChange({ dashboard }: { dashboard: DashboardOverview }) {
  if (!dashboard.canViewSales)
    return <span className="text-inherit">Permission required</span>;
  const change = dashboard.sales.changePercent;
  if (change === null)
    return <span className="text-inherit">No prior-period baseline</span>;
  const positive = change >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="text-primary-foreground inline-flex items-center gap-1 font-semibold">
      <Icon className="size-3.5" aria-hidden="true" />
      {positive ? "+" : ""}
      {change.toFixed(1)}%
      <span className="text-primary-foreground ml-1 font-normal">
        vs. prior period
      </span>
    </span>
  );
}

function SalesPerformance({
  dashboard,
  isDemo,
}: {
  dashboard: DashboardOverview;
  isDemo: boolean;
}) {
  const visible = dashboard.canViewSales;
  const grossProfit = dashboard.sales.grossProfitMinor;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
      <MetricCard
        label="Net sales"
        value={visible ? money(dashboard.sales.netSalesMinor, dashboard) : "—"}
        detail={<SalesChange dashboard={dashboard} />}
        icon={CircleDollarSign}
        emphasis
      />
      <MetricCard
        label="Completed orders"
        value={
          visible
            ? dashboard.sales.completedSales.toLocaleString(dashboard.locale)
            : "—"
        }
        detail={
          visible
            ? `Average ${money(dashboard.sales.averageOrderMinor, dashboard)}`
            : "Sales access required"
        }
        icon={ReceiptText}
        tone="success"
      />
      <MetricCard
        label="Gross profit"
        value={
          visible && grossProfit !== null ? money(grossProfit, dashboard) : "—"
        }
        detail={
          visible && grossProfit === null
            ? "Cost data unavailable"
            : "Estimated from recorded costs"
        }
        icon={TrendingUp}
        tone="primary"
      />
      <MetricCard
        label="Gross margin"
        value={
          visible && dashboard.sales.marginPercent !== null
            ? `${dashboard.sales.marginPercent.toFixed(1)}%`
            : "—"
        }
        detail={
          visible && dashboard.sales.marginPercent === null
            ? "Awaiting complete cost data"
            : "Across completed orders"
        }
        icon={Percent}
        tone="warning"
      />
      <Card className="sm:col-span-2">
        <CardHeader>
          <CardTitle>Sales activity</CardTitle>
          <CardDescription>
            {dashboard.activeStore
              ? `${dashboard.activeStore.name} · ${dashboard.rangeLabel.toLowerCase()}`
              : dashboard.rangeLabel}
          </CardDescription>
          <CardAction className="flex items-center gap-2 text-xs font-medium">
            <span
              className={cn(
                "size-1.5 rounded-full",
                isDemo ? "bg-warning" : "bg-success",
              )}
            />
            <span className="text-muted-foreground">
              {isDemo ? "Sample data" : "Live data"}
            </span>
          </CardAction>
        </CardHeader>
        <CardContent className="p-0">
          <SalesOverview
            data={dashboard.trend}
            currency={dashboard.currency}
            locale={dashboard.locale}
            rangeLabel={dashboard.rangeLabel}
            canViewSales={dashboard.canViewSales}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function AttentionPanel({
  catalog,
  inventory,
  tenantSlug,
}: {
  catalog: DashboardCatalogSnapshot | null;
  inventory: DashboardInventorySnapshot | null;
  tenantSlug: string;
}) {
  const attentionTotal =
    inventory === null ? null : inventory.lowStock + inventory.outOfStock;
  const items = [
    ...(inventory
      ? [
          {
            label: "Out of stock",
            detail:
              inventory.outOfStock === 0
                ? "No unavailable SKUs"
                : `${inventory.outOfStock.toLocaleString()} ${inventory.outOfStock === 1 ? "SKU needs" : "SKUs need"} a restock`,
            value: inventory.outOfStock,
            icon: PackageX,
            tone: "text-destructive",
          },
          {
            label: "Running low",
            detail:
              inventory.lowStock === 0
                ? "Stock levels look healthy"
                : `${inventory.lowStock.toLocaleString()} ${inventory.lowStock === 1 ? "SKU is" : "SKUs are"} below threshold`,
            value: inventory.lowStock,
            icon: TriangleAlert,
            tone: "text-warning-foreground",
          },
        ]
      : []),
    ...(catalog
      ? [
          {
            label: "Active catalog",
            detail: "Products currently available for sale",
            value: catalog.active,
            icon: PackageCheck,
            tone: "text-success-foreground",
          },
        ]
      : []),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
        <CardDescription>Active-store inventory exceptions</CardDescription>
        <CardAction>
          <span
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-semibold tabular-nums",
              attentionTotal === null
                ? "text-muted-foreground"
                : attentionTotal > 0
                  ? "text-warning-foreground"
                  : "text-success-foreground",
            )}
          >
            {attentionTotal === null
              ? "Restricted"
              : attentionTotal > 0
                ? `${attentionTotal} open`
                : "Clear"}
          </span>
        </CardAction>
      </CardHeader>
      {items.length > 0 ? (
        <CardList>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <CardListItem
                key={item.label}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3"
              >
                <span className="flex size-8 items-center justify-center rounded-lg border">
                  <Icon
                    className={cn("size-4", item.tone)}
                    aria-hidden="true"
                  />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-muted-foreground mt-0.5 truncate text-xs">
                    {item.detail}
                  </p>
                </div>
                <strong className="text-sm font-semibold tabular-nums">
                  {item.value.toLocaleString()}
                </strong>
              </CardListItem>
            );
          })}
        </CardList>
      ) : (
        <CardContent>
          <p className="text-sm font-medium">Inventory data is restricted</p>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            Your workspace role does not include catalog or inventory access.
          </p>
        </CardContent>
      )}
      {catalog && (
        <CardFooter>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/app/${tenantSlug}/products`}>
              Review product catalog <ArrowUpRight />
            </Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

function SetupChecklist({
  tenantSlug,
  catalog,
  teamMemberCount,
}: {
  tenantSlug: string;
  catalog: DashboardCatalogSnapshot | null;
  teamMemberCount: number | null;
}) {
  const steps = [
    {
      title: "Workspace configured",
      detail: "Business preferences and the first location are ready.",
      complete: true,
      href: null,
    },
    ...(catalog
      ? [
          {
            title: "Build the catalog",
            detail:
              catalog.total > 0
                ? `${catalog.total.toLocaleString()} products are available.`
                : "Add the products and services your team will manage.",
            complete: catalog.total > 0,
            href: `/app/${tenantSlug}/products`,
          },
        ]
      : []),
    ...(teamMemberCount !== null
      ? [
          {
            title: "Bring in your team",
            detail:
              teamMemberCount > 1
                ? `${teamMemberCount.toLocaleString()} people have workspace access.`
                : "Invite a teammate and assign only the stores they need.",
            complete: teamMemberCount > 1,
            href: `/app/${tenantSlug}/settings/members`,
          },
        ]
      : []),
  ];
  const completed = steps.filter((step) => step.complete).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Getting started</CardTitle>
        <CardDescription>Finish your workspace essentials</CardDescription>
        <CardAction>
          <span className="text-muted-foreground text-xs font-medium tabular-nums">
            {completed}/{steps.length}
          </span>
        </CardAction>
      </CardHeader>
      <CardList>
        {steps.map((step, index) => (
          <CardListItem
            key={step.title}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3"
          >
            <span
              className={cn(
                "mt-0.5 flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold",
                step.complete
                  ? "border-success text-success-foreground"
                  : "text-muted-foreground",
              )}
            >
              {step.complete ? (
                <Check className="size-3" aria-hidden="true" />
              ) : (
                index + 1
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                {step.detail}
              </p>
            </div>
            {step.href && !step.complete && (
              <Link
                href={step.href}
                className="text-primary self-center text-xs font-semibold hover:underline"
              >
                Continue
              </Link>
            )}
          </CardListItem>
        ))}
      </CardList>
    </Card>
  );
}

function activityTime(
  event: DashboardActivityItem,
  dashboard: DashboardOverview,
): string {
  const elapsed = Math.max(
    0,
    new Date(dashboard.asOf).getTime() - new Date(event.occurredAt).getTime(),
  );
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat(dashboard.locale, {
    month: "short",
    day: "numeric",
    timeZone: dashboard.timezone,
  }).format(new Date(event.occurredAt));
}

function RecentActivity({ dashboard }: { dashboard: DashboardOverview }) {
  const toneClasses = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    muted: "bg-muted-foreground",
  } as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>Latest audited workspace operations</CardDescription>
        <CardAction>
          <span className="text-muted-foreground text-xs">Last 90 days</span>
        </CardAction>
      </CardHeader>
      {!dashboard.canViewActivity ? (
        <CardContent>
          <p className="text-sm font-medium">Activity is restricted</p>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            Audit access is required to view workspace activity.
          </p>
        </CardContent>
      ) : dashboard.activity.length === 0 ? (
        <CardContent>
          <p className="text-sm font-medium">No recent activity</p>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            Audited catalog and inventory operations will appear here.
          </p>
        </CardContent>
      ) : (
        <CardList>
          {dashboard.activity.map((event) => (
            <CardListItem
              key={event.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3"
            >
              <span
                className={cn("size-1.5 rounded-full", toneClasses[event.tone])}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{event.title}</p>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {event.summary}
                </p>
              </div>
              <time
                dateTime={event.occurredAt}
                className="text-muted-foreground text-xs tabular-nums"
              >
                {activityTime(event, dashboard)}
              </time>
            </CardListItem>
          ))}
        </CardList>
      )}
    </Card>
  );
}

function StorePerformance({ dashboard }: { dashboard: DashboardOverview }) {
  const hasSales = dashboard.stores.some((store) => store.completedSales > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Store performance</CardTitle>
        <CardDescription>Authorized locations by net sales</CardDescription>
        <CardAction>
          <span className="text-muted-foreground text-xs font-medium">
            {dashboard.rangeLabel}
          </span>
        </CardAction>
      </CardHeader>
      {!dashboard.canViewSales ? (
        <CardContent>
          <p className="text-sm font-medium">Store sales are restricted</p>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            Sales or reporting access is required to compare locations.
          </p>
        </CardContent>
      ) : !hasSales ? (
        <CardContent className="flex min-h-40 items-center">
          <div>
            <p className="text-sm font-medium">No store sales to compare</p>
            <p className="text-muted-foreground mt-1 max-w-lg text-sm leading-6">
              Authorized locations will be ranked here after completed sales are
              recorded in this period.
            </p>
          </div>
        </CardContent>
      ) : (
        <CardList>
          {dashboard.stores.map((store, index) => (
            <CardListItem
              key={store.storeId}
              className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3"
            >
              <span className="text-muted-foreground text-xs font-medium tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {store.storeName}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {store.storeCode} ·{" "}
                      {store.completedSales.toLocaleString(dashboard.locale)}{" "}
                      orders
                    </p>
                  </div>
                  <span className="hidden text-xs font-medium tabular-nums sm:block">
                    {store.sharePercent.toFixed(1)}%
                  </span>
                </div>
                <div className="bg-muted mt-3 h-1 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${Math.max(2, store.sharePercent)}%` }}
                  />
                </div>
              </div>
              <strong className="text-sm font-semibold tabular-nums">
                {money(store.netSalesMinor, dashboard)}
              </strong>
            </CardListItem>
          ))}
        </CardList>
      )}
    </Card>
  );
}

export function DashboardView({
  tenantSlug,
  dashboard,
  catalog,
  inventory,
  isDemo,
}: {
  tenantSlug: string;
  dashboard: DashboardOverview;
  catalog: DashboardCatalogSnapshot | null;
  inventory: DashboardInventorySnapshot | null;
  isDemo: boolean;
}) {
  return (
    <PageContainer size="wide">
      <PageStatus
        tone={isDemo ? "demo" : "live"}
        label={isDemo ? "Demo workspace" : "Live workspace"}
        detail={
          <>
            <span>{dashboard.businessName}</span>
            <span aria-hidden="true">·</span>
            <span>
              {isDemo
                ? "Sample operations"
                : (dashboard.activeStore?.name ?? "No active store")}
            </span>
          </>
        }
      />
      <PageHeader
        eyebrow="Dashboard"
        title="Business overview"
        description={`Welcome back, ${dashboard.firstName}. Here is the latest from your authorized workspace.`}
        actions={
          <>
            <DashboardPeriodSelect
              tenantSlug={tenantSlug}
              range={dashboard.range}
            />
            {catalog && (
              <Button asChild>
                <Link href={`/app/${tenantSlug}/products`}>
                  View catalog <ArrowUpRight />
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(300px,0.72fr)]">
        <section
          className="min-w-0 space-y-5"
          aria-label="Dashboard performance"
        >
          <SalesPerformance dashboard={dashboard} isDemo={isDemo} />
          <StorePerformance dashboard={dashboard} />
        </section>

        <section
          className="min-w-0 space-y-5"
          aria-label="Dashboard operations"
        >
          <AttentionPanel
            catalog={catalog}
            inventory={inventory}
            tenantSlug={tenantSlug}
          />
          <RecentActivity dashboard={dashboard} />
          {!isDemo && (
            <SetupChecklist
              tenantSlug={tenantSlug}
              catalog={catalog}
              teamMemberCount={dashboard.teamMemberCount}
            />
          )}
          {isDemo && (
            <div className="flex items-start gap-3 border-t px-1 pt-5">
              <CircleAlert
                className="text-muted-foreground mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <p className="text-muted-foreground text-xs leading-5">
                This dashboard uses sample operational data. Sign in to see live
                results for your business.
              </p>
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
