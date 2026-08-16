import { Archive, Boxes, FolderTree, Link2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  CategoryManagement,
  NewCategoryDialog,
} from "@/components/categories/category-management";
import { CategoryToolbar } from "@/components/categories/category-toolbar";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { env } from "@/config/env";
import {
  getDemoCategories,
  queryDemoCategories,
} from "@/modules/categories/demo-data";
import { categoryListQuerySchema } from "@/modules/categories/schemas";
import { hasPermission } from "@/modules/permissions/permissions";
import { CategoryRepository } from "@/server/repositories/categories";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Product categories" };

export default async function CategoriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const rawQuery = await searchParams;
  const query = categoryListQuerySchema.parse(rawQuery);
  const demoCategories = getDemoCategories();
  let result = queryDemoCategories(query);
  let metrics = {
    total: demoCategories.length,
    active: demoCategories.length,
    archived: 0,
    assignedProducts: demoCategories.reduce(
      (sum, category) => sum + category.activeProductCount,
      0,
    ),
  };
  let isDemo = true;
  let canCreate = false;
  let canUpdate = false;
  let canArchive = false;
  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      const repository = new CategoryRepository();
      [result, metrics] = await Promise.all([
        repository.list(context, query),
        repository.metrics(context),
      ]);
      isDemo = false;
      canCreate = hasPermission(context.permissions, "product:create");
      canUpdate = hasPermission(context.permissions, "product:update");
      canArchive = hasPermission(context.permissions, "product:archive");
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }
  const pageCount = Math.max(1, Math.ceil(result.total / query.pageSize));
  const page = Math.min(query.page, pageCount);
  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-2">
        <Badge variant={isDemo ? "warning" : "success"}>
          {isDemo ? "Demo data" : "Live tenant data"}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {isDemo
            ? "Read-only taxonomy preview"
            : "Tenant ownership and product assignments verified server-side"}
        </span>
      </div>
      <PageHeader
        eyebrow="Products"
        parentHref={`/app/${tenantSlug}/products`}
        title="Categories"
        description="Organize the catalog with reusable, audited product categories."
        actions={
          <NewCategoryDialog
            tenantSlug={tenantSlug}
            disabled={isDemo || !canCreate}
          />
        }
      />
      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Category summary"
      >
        <MetricCard
          label="Total categories"
          value={metrics.total.toLocaleString()}
          detail="Historical and active"
          icon={FolderTree}
        />
        <MetricCard
          label="Active categories"
          value={metrics.active.toLocaleString()}
          detail="Available for assignments"
          icon={Link2}
          tone="success"
        />
        <MetricCard
          label="Assigned products"
          value={metrics.assignedProducts.toLocaleString()}
          detail="Active and draft products"
          icon={Boxes}
        />
        <MetricCard
          label="Archived categories"
          value={metrics.archived.toLocaleString()}
          detail="Retained for history"
          icon={Archive}
          tone="warning"
        />
      </section>
      <Card className="overflow-hidden">
        <CategoryToolbar query={query} />
        <CategoryManagement
          tenantSlug={tenantSlug}
          items={result.items}
          page={page}
          pageCount={pageCount}
          total={result.total}
          canUpdate={canUpdate}
          canArchive={canArchive}
          isDemo={isDemo}
        />
      </Card>
    </div>
  );
}
