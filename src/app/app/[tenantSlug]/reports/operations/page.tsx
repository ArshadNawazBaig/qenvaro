import { Banknote, ClipboardCheck, Clock3, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MetricCard } from "@/components/dashboard/metric-card";
import { OperationsNav } from "@/components/purchasing/operations-nav";
import { PageContainer, PageStatus } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionDenied } from "@/components/shared/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/config/env";
import { formatMoney } from "@/lib/money";
import {
  demoExpenses,
  demoPurchaseOrders,
} from "@/modules/purchasing/demo-data";
import { hasPermission } from "@/modules/permissions/permissions";
import {
  PurchasingRepository,
  type OperationsSummary,
} from "@/server/repositories/purchasing";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Operations report" };

export default async function OperationsReportPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const approved = demoExpenses.filter(
    (expense) => expense.status === "approved",
  );
  let summary: OperationsSummary = {
    approvedExpenseMinor: approved.reduce(
      (sum, item) => sum + item.amountMinor,
      0,
    ),
    submittedExpenseMinor: demoExpenses
      .filter((item) => item.status === "submitted")
      .reduce((sum, item) => sum + item.amountMinor, 0),
    receivedPurchaseMinor: 4_920_000,
    openPurchaseMinor: demoPurchaseOrders.reduce(
      (sum, order) => sum + order.totalMinor,
      0,
    ),
    expenseCount: demoExpenses.length,
    receiptCount: 1,
    currency: "PKR",
    expenseCategories: approved.map((item) => ({
      name: item.category,
      amountMinor: item.amountMinor,
    })),
    stores: [
      { id: "demo-store", name: "Downtown" },
      { id: "demo-west", name: "West Harbor" },
    ],
  };
  let isDemo = true;
  let denied = false;
  if (tenantSlug !== "demo" && env.MONGODB_URI)
    try {
      const context = await requireTenantContext(tenantSlug);
      isDemo = false;
      if (!hasPermission(context.permissions, "report:read")) denied = true;
      else
        summary = await new PurchasingRepository().operationsSummary(context);
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  const showMoney = (value: number) =>
    formatMoney({ amountMinor: value, currency: summary.currency });
  return (
    <PageContainer>
      <OperationsNav tenantSlug={tenantSlug} current="/reports/operations" />
      <PageStatus
        tone={isDemo ? "demo" : "live"}
        label={isDemo ? "Demo data" : "Live tenant data"}
        detail="Last 90 days · approved expenses only"
      />
      <PageHeader
        eyebrow="Reports"
        title="Purchasing & expenses"
        description="Operational cash-out view of approved expenses, received purchase cost, and open commitments."
      />
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
