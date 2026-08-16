import {
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleAlert,
  PackageCheck,
  PackageX,
  TriangleAlert,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SalesOverview } from "@/components/dashboard/sales-overview";
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
import { env } from "@/config/env";
import { formatMoney } from "@/lib/money";
import { hasPermission } from "@/modules/permissions/permissions";
import { getDatabase } from "@/server/db/client";
import { ProductRepository } from "@/server/repositories/products";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Dashboard" };

function PerformanceStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 px-4 py-4 sm:px-6">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </p>
      <p
        className="mt-2 truncate text-base font-semibold tracking-[-0.025em] tabular-nums lg:text-lg"
        title={value}
      >
        {value}
      </p>
      <p className="text-muted-foreground mt-1 truncate text-xs">{detail}</p>
    </div>
  );
}

function AttentionPanel({
  active,
  low,
  out,
  tenantSlug,
}: {
  active: number;
  low: number;
  out: number;
  tenantSlug: string;
}) {
  const attentionTotal = low + out;
  const items = [
    {
      label: "Out of stock",
      detail:
        out === 0
          ? "No unavailable products"
          : `${out.toLocaleString()} ${out === 1 ? "product needs" : "products need"} a restock`,
      value: out,
      icon: PackageX,
      tone: "text-destructive",
    },
    {
      label: "Running low",
      detail:
        low === 0
          ? "Stock levels look healthy"
          : `${low.toLocaleString()} ${low === 1 ? "product is" : "products are"} below threshold`,
      value: low,
      icon: TriangleAlert,
      tone: "text-warning-foreground",
    },
    {
      label: "Active catalog",
      detail: "Available for sale in this workspace",
      value: active,
      icon: PackageCheck,
      tone: "text-success-foreground",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
        <CardDescription>Inventory exceptions to review</CardDescription>
        <CardAction>
          <span
            className={`rounded-md border px-2 py-1 text-xs font-semibold tabular-nums ${
              attentionTotal > 0
                ? "text-warning-foreground"
                : "text-success-foreground"
            }`}
          >
            {attentionTotal > 0 ? `${attentionTotal} open` : "Clear"}
          </span>
        </CardAction>
      </CardHeader>
      <CardList>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <CardListItem
              key={item.label}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3"
            >
              <span className="flex size-8 items-center justify-center rounded-lg border">
                <Icon className={`size-4 ${item.tone}`} aria-hidden="true" />
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
      <CardFooter>
        <Button asChild variant="outline" className="w-full">
          <Link href={`/app/${tenantSlug}/products`}>
            Review product catalog <ArrowUpRight />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function SetupChecklist({
  tenantSlug,
  productTotal,
  teamMembers,
  canViewMembers,
}: {
  tenantSlug: string;
  productTotal: number;
  teamMembers: number;
  canViewMembers: boolean;
}) {
  const steps = [
    {
      title: "Workspace configured",
      detail: "Business preferences and first location are ready.",
      complete: true,
      href: null,
    },
    {
      title: "Build the catalog",
      detail:
        productTotal > 0
          ? `${productTotal.toLocaleString()} products are available.`
          : "Add the products and services your team will manage.",
      complete: productTotal > 0,
      href: `/app/${tenantSlug}/products`,
    },
    ...(canViewMembers
      ? [
          {
            title: "Bring in your team",
            detail:
              teamMembers > 1
                ? `${teamMembers.toLocaleString()} people have workspace access.`
                : "Invite a teammate and assign only the stores they need.",
            complete: teamMembers > 1,
            href: `/app/${tenantSlug}/settings/members`,
          },
        ]
      : []),
  ];
  const complete = steps.filter((step) => step.complete).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Getting started</CardTitle>
        <CardDescription>Finish your workspace essentials</CardDescription>
        <CardAction>
          <span className="text-muted-foreground text-xs font-medium tabular-nums">
            {complete}/{steps.length}
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
              className={`mt-0.5 flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold ${
                step.complete
                  ? "border-success text-success-foreground"
                  : "text-muted-foreground"
              }`}
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

function RecentActivity({
  isDemo,
  businessName,
}: {
  isDemo: boolean;
  businessName: string;
}) {
  const events = isDemo
    ? [
        {
          title: "Sale NS-DT-10482 completed",
          detail: "Downtown · $428.00",
          time: "8 min",
          tone: "bg-success",
        },
        {
          title: "Counter Kit reached low stock",
          detail: "Riverside · 12 remaining",
          time: "32 min",
          tone: "bg-warning",
        },
        {
          title: "Mina Shah started a shift",
          detail: "Downtown store",
          time: "51 min",
          tone: "bg-primary",
        },
      ]
    : [
        {
          title: `${businessName} workspace created`,
          detail: "First store and owner access configured",
          time: "Today",
          tone: "bg-success",
        },
      ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>Latest events across the business</CardDescription>
        <CardAction>
          <span className="text-muted-foreground text-xs">Today</span>
        </CardAction>
      </CardHeader>
      <CardList>
        {events.map((event) => (
          <CardListItem
            key={event.title}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3"
          >
            <span className={`size-1.5 rounded-full ${event.tone}`} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{event.title}</p>
              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                {event.detail}
              </p>
            </div>
            <span className="text-muted-foreground text-xs tabular-nums">
              {event.time}
            </span>
          </CardListItem>
        ))}
      </CardList>
    </Card>
  );
}

function StorePerformance({
  isDemo,
  netSales,
}: {
  isDemo: boolean;
  netSales: string;
}) {
  const stores = [
    { name: "Downtown", channel: "Retail", sales: "$93.4K", share: 41 },
    { name: "Riverside", channel: "Retail", sales: "$71.6K", share: 31 },
    { name: "Online", channel: "Ecommerce", sales: "$47.8K", share: 21 },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Store performance</CardTitle>
        <CardDescription>Contribution to net sales</CardDescription>
        <CardAction>
          <span className="text-muted-foreground text-xs font-medium">
            Last 7 days
          </span>
        </CardAction>
      </CardHeader>
      {isDemo ? (
        <CardList>
          {stores.map((store, index) => (
            <CardListItem
              key={store.name}
              className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3"
            >
              <span className="text-muted-foreground text-xs font-medium tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{store.name}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {store.channel}
                    </p>
                  </div>
                  <span className="hidden text-xs font-medium tabular-nums sm:block">
                    {store.share}%
                  </span>
                </div>
                <div className="bg-muted mt-3 h-1 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${store.share * 2.2}%` }}
                  />
                </div>
              </div>
              <strong className="text-sm font-semibold tabular-nums">
                {store.sales}
              </strong>
            </CardListItem>
          ))}
        </CardList>
      ) : (
        <CardContent className="flex min-h-40 flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium">Active store</p>
            <p className="text-muted-foreground mt-1 max-w-md text-sm leading-6">
              Store comparisons will appear after more locations record sales.
            </p>
          </div>
          <p className="text-xl font-semibold tracking-[-0.03em] tabular-nums">
            {netSales}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  let isDemo = true;
  let businessName = "Northstar Goods";
  let firstName = "Avery";
  let netSales = "$228.8K";
  let completedSales = "1,284";
  let averageOrder = "$178.19";
  let grossProfit = "$89.3K";
  let margin = "39.0%";
  let productTotal = 16;
  let activeProducts = 12;
  let lowStock = 3;
  let outOfStock = 2;
  let teamMembers = 8;
  let canViewMembers = true;

  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      const database = await getDatabase();
      const repository = new ProductRepository();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [profile, user, catalog, outCount, sales, memberCount] =
        await Promise.all([
          database
            .collection<{ tenantId: string; businessName: string }>(
              "tenantProfiles",
            )
            .findOne(
              { tenantId: context.tenantId },
              { projection: { businessName: 1 } },
            ),
          database
            .collection<{ _id: string; name: string }>("user")
            .findOne({ _id: context.userId }, { projection: { name: 1 } }),
          repository.metrics(context),
          database.collection("products").countDocuments({
            tenantId: context.tenantId,
            stock: 0,
            deletedAt: { $exists: false },
          }),
          database
            .collection("sales")
            .aggregate<{
              netSalesMinor: number;
              grossProfitMinor: number;
              completedSales: number;
            }>([
              {
                $match: {
                  tenantId: context.tenantId,
                  storeId: context.activeStoreId ?? { $in: [] },
                  status: "completed",
                  completedAt: { $gte: sevenDaysAgo },
                },
              },
              {
                $group: {
                  _id: null,
                  netSalesMinor: { $sum: "$netTotalMinor" },
                  grossProfitMinor: { $sum: "$grossProfitMinor" },
                  completedSales: { $sum: 1 },
                },
              },
            ])
            .next(),
          database.collection("member").countDocuments({
            organizationId: context.tenantId,
          }),
        ]);
      if (!profile || !user)
        throw new Error("The dashboard projection is incomplete.");
      isDemo = false;
      businessName = profile.businessName;
      firstName = user.name.split(/\s+/)[0] ?? "there";
      const salesCurrency = catalog.currency;
      const liveSales = sales?.netSalesMinor ?? 0;
      const liveProfit = sales?.grossProfitMinor ?? 0;
      const liveCompleted = sales?.completedSales ?? 0;
      netSales = formatMoney({
        amountMinor: liveSales,
        currency: salesCurrency,
      });
      completedSales = liveCompleted.toLocaleString();
      averageOrder = formatMoney({
        amountMinor:
          liveCompleted === 0 ? 0 : Math.round(liveSales / liveCompleted),
        currency: salesCurrency,
      });
      grossProfit = formatMoney({
        amountMinor: liveProfit,
        currency: salesCurrency,
      });
      margin = `${liveSales === 0 ? 0 : ((liveProfit / liveSales) * 100).toFixed(1)}%`;
      productTotal = catalog.total;
      activeProducts = catalog.active;
      lowStock = Math.max(0, catalog.attention - outCount);
      outOfStock = outCount;
      teamMembers = memberCount;
      canViewMembers = hasPermission(context.permissions, "member:read");
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1540px] space-y-6 p-4 sm:p-6 lg:p-8 xl:p-10">
      <header className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="text-muted-foreground mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span>{businessName}</span>
            <span aria-hidden="true">/</span>
            <span>{isDemo ? "Demo workspace" : "Active store"}</span>
            <span
              className={`ml-1 size-1.5 rounded-full ${isDemo ? "bg-warning" : "bg-success"}`}
            />
          </div>
          <h1 className="text-[1.85rem] leading-none font-semibold tracking-[-0.04em] sm:text-[2.15rem]">
            Business overview
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            {isDemo
              ? `Welcome back, ${firstName}. Here is how the business is performing.`
              : `Welcome back, ${firstName}. Here is the latest from your active store.`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" disabled>
            <CalendarDays /> Last 7 days
          </Button>
          <Button asChild>
            <Link href={`/app/${tenantSlug}/products`}>
              View catalog <ArrowUpRight />
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,0.72fr)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sales performance</CardTitle>
              <CardDescription>Net sales for the active period</CardDescription>
              <CardAction className="flex items-center gap-2 text-xs font-medium">
                <span
                  className={`size-1.5 rounded-full ${isDemo ? "bg-warning" : "bg-success"}`}
                />
                <span className="text-muted-foreground">
                  {isDemo ? "Sample data" : "Live data"}
                </span>
              </CardAction>
            </CardHeader>
            <CardContent className="p-0">
              <div className="px-5 pt-6 sm:px-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-muted-foreground text-xs font-medium">
                      Net sales
                    </p>
                    <p className="mt-2 text-4xl leading-none font-semibold tracking-[-0.055em] tabular-nums sm:text-[2.75rem]">
                      {netSales}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {isDemo ? (
                      <>
                        <span className="text-success-foreground font-semibold">
                          +12.4%
                        </span>
                        <span className="text-muted-foreground">
                          from previous week
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        Active store · last 7 days
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-1 divide-y border-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  <PerformanceStat
                    label="Orders"
                    value={completedSales}
                    detail={`Avg. ${averageOrder}`}
                  />
                  <PerformanceStat
                    label="Gross profit"
                    value={grossProfit}
                    detail="Estimated"
                  />
                  <PerformanceStat
                    label="Margin"
                    value={margin}
                    detail="Gross margin"
                  />
                </div>
              </div>
              <SalesOverview hasData={isDemo} />
            </CardContent>
          </Card>

          <StorePerformance isDemo={isDemo} netSales={netSales} />
        </div>

        <aside className="space-y-6">
          <AttentionPanel
            active={activeProducts}
            low={lowStock}
            out={outOfStock}
            tenantSlug={tenantSlug}
          />
          <RecentActivity isDemo={isDemo} businessName={businessName} />
          {!isDemo && (
            <SetupChecklist
              tenantSlug={tenantSlug}
              productTotal={productTotal}
              teamMembers={teamMembers}
              canViewMembers={canViewMembers}
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
        </aside>
      </div>
    </div>
  );
}
