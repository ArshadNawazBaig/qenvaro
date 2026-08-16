import {
  ArrowUpRight,
  Banknote,
  Boxes,
  CalendarDays,
  CircleDollarSign,
  Download,
  PackageX,
  ReceiptText,
  ShoppingBag,
  Store,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SalesOverview } from "@/components/dashboard/sales-overview";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { env } from "@/config/env";
import { formatMoney } from "@/lib/money";
import { getDatabase } from "@/server/db/client";
import { ProductRepository } from "@/server/repositories/products";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Dashboard" };

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
  let margin = "39.0% estimated margin";
  let activeProducts = 12;
  let lowStock = 3;
  let outOfStock = 2;

  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      const database = await getDatabase();
      const repository = new ProductRepository();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [profile, user, catalog, outCount, sales] = await Promise.all([
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
      margin = `${liveSales === 0 ? 0 : ((liveProfit / liveSales) * 100).toFixed(1)}% estimated margin`;
      activeProducts = catalog.active;
      lowStock = Math.max(0, catalog.attention - outCount);
      outOfStock = outCount;
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }
  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-2">
        <Badge variant={isDemo ? "warning" : "success"}>
          {isDemo ? "Demo data" : "Live tenant data"}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {businessName} · {isDemo ? "Aug 10–16, 2026" : "Last 7 days"}
        </span>
      </div>
      <PageHeader
        title={`${isDemo ? "Good morning" : "Welcome"}, ${firstName}`}
        description={
          isDemo
            ? "Here’s what’s happening across your business this week."
            : "Your workspace is ready. Live metrics will grow with your operations."
        }
        actions={
          <>
            <Button variant="outline" disabled>
              <CalendarDays /> Last 7 days
            </Button>
            <Button variant="outline" disabled>
              <Download /> Export report
            </Button>
          </>
        }
      />
      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Business metrics"
      >
        <MetricCard
          label="Net sales"
          value={netSales}
          detail={
            isDemo ? "12.4% from last week" : "Active store · last 7 days"
          }
          icon={CircleDollarSign}
        />
        <MetricCard
          label="Completed sales"
          value={completedSales}
          detail={`Average order ${averageOrder}`}
          icon={ShoppingBag}
          tone="success"
        />
        <MetricCard
          label="Gross profit estimate"
          value={grossProfit}
          detail={margin}
          icon={Banknote}
        />
        <MetricCard
          label="Low stock"
          value={(lowStock + outOfStock).toLocaleString()}
          detail={`${outOfStock.toLocaleString()} products out of stock`}
          icon={PackageX}
          tone="warning"
        />
      </section>
      {isDemo ? (
        <SalesOverview />
      ) : (
        <Card>
          <CardContent className="flex min-h-56 flex-col items-center justify-center p-8 text-center">
            <span className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
              <ShoppingBag className="size-5" />
            </span>
            <h2 className="mt-4 font-semibold">No completed sales yet</h2>
            <p className="text-muted-foreground mt-1 max-w-md text-sm">
              Sales charts will appear here after the first transaction is
              completed in an authorized store.
            </p>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Today’s activity</CardTitle>
              <CardDescription>
                Recent operational events across your stores
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" disabled>
              View audit log <ArrowUpRight />
            </Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {(isDemo
              ? [
                  {
                    icon: ReceiptText,
                    title: "Sale NS-DT-10482 completed",
                    detail: "Downtown · $428.00 · 8 minutes ago",
                    tone: "bg-success/25 text-success-foreground",
                  },
                  {
                    icon: Boxes,
                    title: "Counter Kit reached low stock",
                    detail: "Riverside · 12 remaining · 32 minutes ago",
                    tone: "bg-warning/25 text-warning-foreground",
                  },
                  {
                    icon: UsersRound,
                    title: "Mina Shah started a shift",
                    detail: "Downtown · 51 minutes ago",
                    tone: "bg-accent text-accent-foreground",
                  },
                ]
              : [
                  {
                    icon: Store,
                    title: `${businessName} workspace created`,
                    detail: "Your first store and owner access are ready",
                    tone: "bg-success/25 text-success-foreground",
                  },
                ]
            ).map((item) => (
              <div
                key={item.title}
                className="hover:bg-muted/35 flex items-center gap-3 rounded-lg px-2 py-3"
              >
                <div
                  className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${item.tone}`}
                >
                  <item.icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Catalog health</CardTitle>
            <CardDescription>Quick actions for attention items</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-muted/50 flex items-center justify-between rounded-lg p-3">
              <span className="text-sm">Active products</span>
              <strong>{activeProducts.toLocaleString()}</strong>
            </div>
            <div className="bg-warning/15 flex items-center justify-between rounded-lg p-3">
              <span className="text-sm">Low stock</span>
              <strong className="text-warning-foreground">
                {lowStock.toLocaleString()}
              </strong>
            </div>
            <div className="bg-destructive/10 flex items-center justify-between rounded-lg p-3">
              <span className="text-sm">Out of stock</span>
              <strong className="text-destructive">
                {outOfStock.toLocaleString()}
              </strong>
            </div>
            <Button asChild className="mt-2 w-full">
              <Link href={`/app/${tenantSlug}/products`}>
                Review products <ArrowUpRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
