import { Archive, Boxes, Link2, Tags } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { NewTagDialog, TagManagement } from "@/components/tags/tag-management";
import { TagToolbar } from "@/components/tags/tag-toolbar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { env } from "@/config/env";
import { demoProducts } from "@/modules/products/demo-data";
import { getDemoTags, queryDemoTags } from "@/modules/tags/demo-data";
import { tagListQuerySchema } from "@/modules/tags/schemas";
import { hasPermission } from "@/modules/permissions/permissions";
import { TagRepository } from "@/server/repositories/tags";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Product tags" };

export default async function TagsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const rawQuery = await searchParams;
  const query = tagListQuerySchema.parse(rawQuery);
  const demoTags = getDemoTags();
  let result = queryDemoTags(rawQuery);
  let metrics = {
    total: demoTags.length,
    active: demoTags.filter((tag) => tag.status === "active").length,
    archived: demoTags.filter((tag) => tag.status === "archived").length,
    assignedProducts: demoProducts.filter(
      (product) =>
        product.tagIds.length > 0 &&
        (product.status === "active" || product.status === "draft"),
    ).length,
  };
  let isDemo = true;
  let canCreate = false;
  let canUpdate = false;
  let canArchive = false;

  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      const repository = new TagRepository();
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
            ? "Read-only merchandising preview"
            : "Tenant ownership and product assignments verified server-side"}
        </span>
      </div>
      <PageHeader
        eyebrow="Products"
        parentHref={`/app/${tenantSlug}/products`}
        title="Tags"
        description="Create flexible product labels for merchandising, search, and day-to-day catalog workflows."
        actions={
          <NewTagDialog
            tenantSlug={tenantSlug}
            disabled={isDemo || !canCreate}
          />
        }
      />
      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Tag summary"
      >
        <MetricCard
          label="Total tags"
          value={metrics.total.toLocaleString()}
          detail="Historical and active"
          icon={Tags}
        />
        <MetricCard
          label="Active tags"
          value={metrics.active.toLocaleString()}
          detail="Available for assignments"
          icon={Link2}
          tone="success"
        />
        <MetricCard
          label="Tagged products"
          value={metrics.assignedProducts.toLocaleString()}
          detail="Active and draft products"
          icon={Boxes}
        />
        <MetricCard
          label="Archived tags"
          value={metrics.archived.toLocaleString()}
          detail="Retained for history"
          icon={Archive}
          tone="warning"
        />
      </section>
      <Card>
        <TagToolbar query={query} />
        <TagManagement
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
