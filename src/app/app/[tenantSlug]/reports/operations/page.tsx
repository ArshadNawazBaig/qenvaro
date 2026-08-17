import {
  Banknote,
  ClipboardCheck,
  Clock3,
  Download,
  ReceiptText,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MetricCard } from "@/components/dashboard/metric-card";
import { OperationsReportToolbar } from "@/components/reports/operations-report-toolbar";
import { ReportsNav } from "@/components/reports/reports-nav";
import { PageContainer, PageStatus } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionDenied } from "@/components/shared/states";
import { PrintButton } from "@/components/shared/print-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/config/env";
import { formatMoney } from "@/lib/money";
import { hasPermission } from "@/modules/permissions/permissions";
import { getDemoOperationsSummary } from "@/modules/reports/operations-demo-data";
import { operationsReportQuerySchema } from "@/modules/reports/operations-schemas";
import {
  PurchasingRepository,
  type OperationsSummary,
} from "@/server/repositories/purchasing";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Operations report" };

export default async function OperationsReportPage({
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
  const query = operationsReportQuerySchema.parse({
    range: untrustedQuery.range,
    store: untrustedQuery.store,
  });
  let summary: OperationsSummary = getDemoOperationsSummary(query);
  let isDemo = true;
  let denied = false;
  let canExport = false;
  if (tenantSlug !== "demo" && env.MONGODB_URI)
    try {
      const context = await requireTenantContext(tenantSlug);
      isDemo = false;
      if (!hasPermission(context.permissions, "report:read")) denied = true;
      else {
        canExport = hasPermission(context.permissions, "report:export");
        summary = await new PurchasingRepository().operationsSummary(
          context,
          query,
        );
      }
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  const showMoney = (value: number) =>
    formatMoney({ amountMinor: value, currency: summary.currency });
  return (
    <PageContainer>
      <ReportsNav tenantSlug={tenantSlug} current="/reports/operations" />
      <PageStatus
        tone={isDemo ? "demo" : "live"}
        label={isDemo ? "Demo data" : "Live tenant data"}
        detail={`${summary.range === "365d" ? "Last 12 months" : `Last ${summary.range.replace("d", "")} days`} · approved expenses only`}
      />
      <PageHeader
        eyebrow="Reports"
        title="Purchasing & expenses"
        description="Operational cash-out view of approved expenses, received purchase cost, and open commitments."
        actions={
          <>
            {!denied && <PrintButton label="Print report" />}
            {canExport && !isDemo ? (
              <Button variant="outline" asChild>
                <a
                  href={`/api/app/${encodeURIComponent(tenantSlug)}/reports/operations/export?range=${summary.range}&store=${encodeURIComponent(summary.selectedStoreId)}`}
                  download
                >
                  <Download /> Export CSV
                </a>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                <Download /> Export CSV
              </Button>
            )}
          </>
        }
      />
      {!denied && (
        <Card>
          <OperationsReportToolbar
            range={summary.range}
            selectedStoreId={summary.selectedStoreId}
            stores={summary.stores}
          />
        </Card>
      )}
      {denied ? (
        <PermissionDenied />
      ) : (
        <>
          <section
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Operations report summary"
          >
            <MetricCard
              label="Approved expenses"
              value={showMoney(summary.approvedExpenseMinor)}
              detail={`${summary.expenseCount} reviewed records`}
              icon={ReceiptText}
            />
            <MetricCard
              label="Pending approval"
              value={showMoney(summary.submittedExpenseMinor)}
              detail="Excluded from approved totals"
              icon={Clock3}
              tone="warning"
            />
            <MetricCard
              label="Received purchases"
              value={showMoney(summary.receivedPurchaseMinor)}
              detail={`${summary.receiptCount} goods receipts`}
              icon={ClipboardCheck}
              tone="success"
            />
            <MetricCard
              label="Open commitments"
              value={showMoney(summary.openPurchaseMinor)}
              detail="Draft through partially received"
              icon={Banknote}
            />
          </section>
          <Card>
            <CardHeader>
              <CardTitle>Approved expense categories</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.expenseCategories.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No approved expenses in the reporting window.
                </p>
              ) : (
                <div className="space-y-4">
                  {summary.expenseCategories.map((category) => {
                    const share =
                      summary.approvedExpenseMinor > 0
                        ? Math.round(
                            (category.amountMinor /
                              summary.approvedExpenseMinor) *
                              100,
                          )
                        : 0;
                    return (
                      <div key={category.name}>
                        <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium">{category.name}</span>
                          <span>
                            {showMoney(category.amountMinor)} · {share}%
                          </span>
                        </div>
                        <div className="bg-muted h-2 overflow-hidden rounded-full">
                          <div
                            className="bg-primary h-full rounded-full"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          <p className="text-muted-foreground text-xs">
            Operational reporting is not a statutory accounting statement.
            Purchase values use received line cost; expenses are included only
            after approval.
          </p>
        </>
      )}
    </PageContainer>
  );
}
