import {
  Boxes,
  CircleDollarSign,
  Download,
  PackageCheck,
  PackageSearch,
  TriangleAlert,
  Upload,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MetricCard } from "@/components/dashboard/metric-card";
import { NewProductDialog } from "@/components/products/new-product-dialog";
import { ProductInsights } from "@/components/products/product-insights";
import { ProductTable } from "@/components/products/product-table";
import { ProductToolbar } from "@/components/products/product-toolbar";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { env } from "@/config/env";
import { demoProducts } from "@/modules/products/demo-data";
import { queryDemoProducts } from "@/modules/products/queries";
import { productListQuerySchema } from "@/modules/products/schemas";
import { ProductRepository } from "@/server/repositories/products";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({
  searchParams,
  params,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const rawQuery = await searchParams;
  let result = queryDemoProducts(rawQuery);
  let categories = result.categories;
  let metrics = {
    total: demoProducts.length,
    active: demoProducts.filter((product) => product.status === "active")
      .length,
    attention: demoProducts.filter(
      (product) =>
        product.stock !== null && product.stock <= product.reorderLevel,
    ).length,
    revenueMinor: demoProducts.reduce(
      (sum, product) => sum + product.revenueMinor,
      0,
    ),
    currency: "USD",
  };
  let isDemo = true;
  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      const repository = new ProductRepository();
      const query = productListQuerySchema.parse(rawQuery);
      const [data, databaseCategories, databaseMetrics] = await Promise.all([
        repository.list(context, query),
        repository.categories(context),
        repository.metrics(context),
      ]);
      const pageCount = Math.max(1, Math.ceil(data.total / query.pageSize));
      result = {
        items: data.items,
        total: data.total,
        page: Math.min(query.page, pageCount),
        pageSize: query.pageSize,
        pageCount,
        query,
        categories: databaseCategories,
      };
      categories = databaseCategories;
      metrics = databaseMetrics;
      isDemo = false;
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
          {isDemo
            ? "Connect local services and sign in to enable authenticated mutations."
            : "Tenant and store access verified server-side."}
        </span>
      </div>
      <PageHeader
        title="Products"
        description="Manage the catalog, availability, and product performance across every store."
        actions={
          <>
            <Button
              variant="outline"
              disabled
              title="CSV import preview is planned for the next catalog slice"
            >
              <Upload /> Import
            </Button>
            <Button
              variant="outline"
              disabled
              title="Filtered CSV export is planned for the next catalog slice"
            >
              <Download /> Export
            </Button>
            <NewProductDialog tenantSlug={tenantSlug} />
          </>
        }
      />
      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Product metrics"
      >
        <MetricCard
          label="Total products"
          value={metrics.total.toLocaleString()}
          detail="Across 6 categories"
          icon={Boxes}
        />
        <MetricCard
          label="Active products"
          value={metrics.active.toLocaleString()}
          detail={`${metrics.total === 0 ? 0 : Math.round((metrics.active / metrics.total) * 100)}% of catalog`}
          icon={PackageCheck}
          tone="success"
        />
        <MetricCard
          label="Needs attention"
          value={metrics.attention.toLocaleString()}
          detail="Low or out of stock"
          icon={TriangleAlert}
          tone="warning"
        />
        <MetricCard
          label="Product revenue"
          value={formatMoney({
            amountMinor: metrics.revenueMinor,
            currency: metrics.currency,
          })}
          detail={isDemo ? "Current demo period" : "Authorized catalog revenue"}
          icon={CircleDollarSign}
        />
      </section>
      <ProductInsights />
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">Product catalog</h2>
            <p className="text-muted-foreground text-xs">
              Server-shaped results with shareable URL filters
            </p>
          </div>
          <PackageSearch className="text-muted-foreground size-5" />
        </div>
        <ProductToolbar query={result.query} categories={categories} />
        <ProductTable
          items={result.items}
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
        />
      </Card>
    </div>
  );
}
