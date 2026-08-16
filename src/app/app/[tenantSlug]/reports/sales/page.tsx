import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SalesReportView } from "@/components/reports/sales-report-view";
import { Card, CardContent } from "@/components/ui/card";
import { env } from "@/config/env";
import { hasPermission } from "@/modules/permissions/permissions";
import { getDemoSalesReport } from "@/modules/reports/sales-demo-data";
import { salesReportQuerySchema } from "@/modules/reports/sales-schemas";
import { SalesReportRepository } from "@/server/repositories/sales-reports";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Sales performance" };

export default async function SalesReportPage({
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
  const query = salesReportQuerySchema.parse({
    range: untrustedQuery.range,
    store: untrustedQuery.store,
    page: untrustedQuery.page,
    pageSize: untrustedQuery.pageSize,
  });
  let report = getDemoSalesReport(query);
  let isDemo = true;
  let permissionDenied = false;

  if (tenantSlug === "demo" && env.NODE_ENV === "production") notFound();

  if (env.MONGODB_URI && tenantSlug !== "demo") {
    try {
      const context = await requireTenantContext(tenantSlug);
      isDemo = false;
      if (!hasPermission(context.permissions, "report:read")) {
        permissionDenied = true;
      } else {
        report = await new SalesReportRepository().overview(context, query);
      }
    } catch {
      notFound();
    }
  }

  if (permissionDenied)
    return (
      <div className="mx-auto w-full max-w-[1480px] p-4 sm:p-6 lg:p-8">
        <Card>
          <CardContent className="flex min-h-72 flex-col items-center justify-center text-center">
            <BarChart3 className="text-muted-foreground size-8" />
            <h1 className="mt-4 text-lg font-semibold">
              Reporting access is restricted
            </h1>
            <p className="text-muted-foreground mt-1 max-w-md text-sm leading-6">
              Your current role cannot view business performance reports. Ask an
              owner or administrator to update your reporting permission.
            </p>
          </CardContent>
        </Card>
      </div>
    );

  return (
    <SalesReportView
      tenantSlug={tenantSlug}
      report={report}
      query={{ ...query, store: report.selectedStoreId }}
      isDemo={isDemo}
    />
  );
}
