import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportsNav } from "@/components/reports/reports-nav";
import { ReportsOverviewView } from "@/components/reports/reports-overview-view";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionDenied } from "@/components/shared/states";
import { env } from "@/config/env";
import { hasPermission } from "@/modules/permissions/permissions";
import { getDemoOperationsSummary } from "@/modules/reports/operations-demo-data";
import { reportsOverviewQuerySchema } from "@/modules/reports/overview-schemas";
import { getDemoSalesReport } from "@/modules/reports/sales-demo-data";
import { SalesReportRepository } from "@/server/repositories/sales-reports";
import { PurchasingRepository } from "@/server/repositories/purchasing";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Reports overview" };

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ tenantSlug }, untrustedQuery] = await Promise.all([
    params,
    searchParams,
  ]);
  const query = reportsOverviewQuerySchema.parse({
    range: untrustedQuery.range,
    store: untrustedQuery.store,
  });
  const salesQuery = {
    range: query.range,
    store: query.store,
    page: 1,
    pageSize: 5,
  } as const;
  const operationsQuery = {
    range: query.range,
    store: query.store,
  } as const;

  let report = getDemoSalesReport(salesQuery);
  let operations = getDemoOperationsSummary(operationsQuery);
  let isDemo = true;
  let denied = false;

  if (tenantSlug === "demo" && env.NODE_ENV === "production") notFound();

  if (env.MONGODB_URI && tenantSlug !== "demo") {
    try {
      const context = await requireTenantContext(tenantSlug);
      isDemo = false;
      if (!hasPermission(context.permissions, "report:read")) denied = true;
      else
        [report, operations] = await Promise.all([
          new SalesReportRepository().overview(context, salesQuery),
          new PurchasingRepository().operationsSummary(
            context,
            operationsQuery,
          ),
        ]);
    } catch {
      notFound();
    }
  }

  if (denied)
    return (
      <PageContainer>
        <ReportsNav tenantSlug={tenantSlug} current="/reports" />
        <PageHeader
          eyebrow="Reports"
          title="Reports overview"
          description="Monitor business performance across your authorized stores."
        />
        <PermissionDenied />
      </PageContainer>
    );

  return (
    <ReportsOverviewView
      tenantSlug={tenantSlug}
      report={report}
      operations={operations}
      range={query.range}
      isDemo={isDemo}
    />
  );
}
