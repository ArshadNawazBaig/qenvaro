import {
  Boxes,
  CircleDollarSign,
  FolderTree,
  PackageCheck,
  PackageSearch,
  Ruler,
  Tags,
  TriangleAlert,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MetricCard } from "@/components/dashboard/metric-card";
import { NewProductDialog } from "@/components/products/new-product-dialog";
import { ProductInsights } from "@/components/products/product-insights";
import { ProductCsvActions } from "@/components/products/product-csv-actions";
import { ProductTable } from "@/components/products/product-table";
import { ProductToolbar } from "@/components/products/product-toolbar";
import { PageContainer, PageStatus } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { env } from "@/config/env";
import { demoProducts } from "@/modules/products/demo-data";
import { getDemoTagOptions } from "@/modules/tags/demo-data";
import { hasPermission } from "@/modules/permissions/permissions";
import { queryDemoProducts } from "@/modules/products/queries";
import { ProductCsvService } from "@/modules/products/csv-service";
import { productListQuerySchema } from "@/modules/products/schemas";
import { ProductRepository } from "@/server/repositories/products";
import { TagRepository } from "@/server/repositories/tags";
import { UnitRepository } from "@/server/repositories/units";
import { getDemoUnitOptions } from "@/modules/units/demo-data";
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
  let tags = getDemoTagOptions();
  let units = getDemoUnitOptions();
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
  let canCreate = false;
  let canUpdate = false;
  let canArchive = false;
  let canImport = false;
  let canExport = false;
  let csvFeatureEnabled = false;
  let csvWriteEnabled = false;
  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      const repository = new ProductRepository();
      const query = productListQuerySchema.parse(rawQuery);
      const [
        data,
        databaseCategories,
        databaseTags,
        databaseMetrics,
        csvAvailability,
        databaseUnits,
      ] = await Promise.all([
        repository.list(context, query),
        repository.categories(context),
        new TagRepository().activeOptions(context),
        repository.metrics(context),
        new ProductCsvService().availability(context),
        new UnitRepository().activeOptions(context),
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
      tags = databaseTags;
      units = databaseUnits;
      metrics = databaseMetrics;
      isDemo = false;
      canCreate = hasPermission(context.permissions, "product:create");
      canUpdate = hasPermission(context.permissions, "product:update");
      canArchive = hasPermission(context.permissions, "product:archive");
      csvFeatureEnabled = csvAvailability.featureEnabled;
      csvWriteEnabled = csvAvailability.writeEnabled;
      canImport =
        csvFeatureEnabled &&
        csvWriteEnabled &&
        hasPermission(context.permissions, "product:import");
      canExport =
        csvFeatureEnabled &&
        hasPermission(context.permissions, "product:export");
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }
  const exportParams = new URLSearchParams({
    q: result.query.q,
    category: result.query.category,
    tag: result.query.tag,
    stock: result.query.stock,
    status: result.query.status,
    sort: result.query.sort,
    direction: result.query.direction,
  });
  const exportHref = `/api/app/${encodeURIComponent(tenantSlug)}/products/csv/export?${exportParams.toString()}`;
  const baseCsvDisabledReason = isDemo
    ? "CSV operations require a live tenant."
    : !csvFeatureEnabled
      ? "CSV import and export are available on Growth and higher plans."
      : "You do not have permission for this CSV operation.";
  const importDisabledReason =
    csvFeatureEnabled && !csvWriteEnabled
      ? "Billing access is read-only; importing is currently disabled."
      : baseCsvDisabledReason;
  return (
    <PageContainer size="wide">
      <PageStatus
        tone={isDemo ? "demo" : "live"}
        label={isDemo ? "Demo data" : "Live tenant data"}
        detail={
          isDemo
            ? "Connect local services and sign in to enable authenticated mutations."
            : "Tenant and store access verified server-side."
        }
      />
      <PageHeader
        title="Products"
        description="Manage the catalog, availability, and product performance across every store."
        actions={
          <>
            <NewProductDialog
              tenantSlug={tenantSlug}
              currency={metrics.currency}
              categories={categories}
              tags={tags}
              units={units}
              disabled={isDemo || !canCreate}
            />
            <Button asChild variant="outline">
              <Link href={`/app/${tenantSlug}/products/categories`}>
                <FolderTree /> Categories
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/app/${tenantSlug}/products/tags`}>
                <Tags /> Tags
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/app/${tenantSlug}/products/units`}>
                <Ruler /> Units
              </Link>
            </Button>
            <ProductCsvActions
              tenantSlug={tenantSlug}
              exportHref={exportHref}
              importDisabled={!canImport}
              exportDisabled={!canExport}
              importDisabledReason={importDisabledReason}
              exportDisabledReason={baseCsvDisabledReason}
            />
          </>
        }
      />
      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Product metrics"
      >
        <MetricCard
          label="Total products"
          value={metrics.total.toLocaleString()}
          detail={`Across ${categories.length.toLocaleString()} categories`}
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
      <ProductInsights isDemo={isDemo} catalogTotal={metrics.total} />
      <Card>
        <CardHeader>
          <CardTitle>Product catalog</CardTitle>
          <CardDescription>
            Server-shaped results with shareable URL filters
          </CardDescription>
          <CardAction>
            <PackageSearch className="text-muted-foreground size-5" />
          </CardAction>
        </CardHeader>
        <ProductToolbar
          query={result.query}
          categories={categories}
          tags={tags}
        />
        <ProductTable
          items={result.items}
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          tenantSlug={tenantSlug}
          canUpdate={canUpdate}
          canArchive={canArchive}
          isDemo={isDemo}
        />
      </Card>
    </PageContainer>
  );
}
