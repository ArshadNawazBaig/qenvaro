import { Archive, Boxes, Link2, Ruler } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import {
  NewUnitDialog,
  UnitManagement,
} from "@/components/units/unit-management";
import { UnitToolbar } from "@/components/units/unit-toolbar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { env } from "@/config/env";
import { hasPermission } from "@/modules/permissions/permissions";
import { demoProducts } from "@/modules/products/demo-data";
import { getDemoUnitOptions, queryDemoUnits } from "@/modules/units/demo-data";
import {
  unitListQuerySchema,
  type UnitListItem,
} from "@/modules/units/schemas";
import { UnitRepository } from "@/server/repositories/units";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Units of measure" };

export default async function UnitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const rawQuery = await searchParams;
  const query = unitListQuerySchema.parse(rawQuery);
  const demoUnits = getDemoUnitOptions();
  let result: { items: UnitListItem[]; total: number } =
    queryDemoUnits(rawQuery);
  let metrics = {
    total: demoUnits.length,
    active: demoUnits.length,
    archived: 0,
    assignedProducts: demoProducts.filter(
      (product) => product.status === "active" || product.status === "draft",
    ).length,
  };
  let isDemo = true;
  let canCreate = false;
  let canUpdate = false;
  let canArchive = false;

  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      const repository = new UnitRepository();
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
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isDemo ? "warning" : "success"}>
          {isDemo ? "Demo data" : "Live tenant data"}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {isDemo
            ? "Read-only unit-management preview"
            : "Tenant ownership and product assignments verified server-side"}
        </span>
      </div>
      <PageHeader
        eyebrow="Products"
        parentHref={`/app/${tenantSlug}/products`}
        title="Units of measure"
        description="Standardize how quantities are labeled across products, inventory, and store operations."
        actions={
          <NewUnitDialog
            tenantSlug={tenantSlug}
            disabled={isDemo || !canCreate}
          />
        }
      />
      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Unit summary"
      >
        <MetricCard
          label="Total units"
          value={metrics.total.toLocaleString()}
          detail="Historical and active"
          icon={Ruler}
        />
        <MetricCard
          label="Active units"
          value={metrics.active.toLocaleString()}
          detail="Available for assignment"
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
          label="Archived units"
          value={metrics.archived.toLocaleString()}
          detail="Retained for history"
          icon={Archive}
          tone="warning"
        />
      </section>
      <Card>
        <UnitToolbar query={query} />
        <UnitManagement
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
