import {
  ArrowUpRight,
  Banknote,
  ChartNoAxesCombined,
  CircleDollarSign,
  ReceiptText,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { MetricCard } from "@/components/dashboard/metric-card";
import {
  ProductContributionCard,
  StoreContributionCard,
} from "@/components/reports/contribution-cards";
import {
  reportCompactMoney,
  reportDate,
  reportMoney,
} from "@/components/reports/report-format";
import { ReportsNav } from "@/components/reports/reports-nav";
import { ReportsOverviewToolbar } from "@/components/reports/reports-overview-toolbar";
import { SalesReportTrend } from "@/components/reports/sales-report-trend";
import { PageContainer, PageStatus } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import type { ReportsOverviewRange } from "@/modules/reports/overview-schemas";
import type { SalesReportOverview } from "@/modules/reports/sales-schemas";
import type { OperationsSummary } from "@/server/repositories/purchasing";

function OperationsSnapshot({
  summary,
  locale,
}: {
  summary: OperationsSummary;
  locale: string;
}) {
  const money = (amountMinor: number) =>
    formatMoney({ amountMinor, currency: summary.currency }, locale);
  const maxCategory = Math.max(
    ...summary.expenseCategories.map((category) => category.amountMinor),
    1,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Purchasing and expenses</CardTitle>
        <p className="text-muted-foreground text-sm">
          Approved spend, pending decisions, and purchase commitments.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          {[
            ["Approved expenses", money(summary.approvedExpenseMinor)],
            ["Pending approval", money(summary.submittedExpenseMinor)],
            ["Received purchases", money(summary.receivedPurchaseMinor)],
            ["Open commitments", money(summary.openPurchaseMinor)],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-muted-foreground text-[11px] font-medium">
                {label}
              </p>
              <p className="mt-1.5 text-sm font-semibold tabular-nums sm:text-base">
                {value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 border-t pt-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold">Approved expense categories</p>
            <span className="text-muted-foreground text-[10px]">
              {summary.expenseCount} records
            </span>
          </div>
          {summary.expenseCategories.length === 0 ? (
            <p className="text-muted-foreground py-5 text-center text-xs">
              No approved expenses in this period.
            </p>
          ) : (
            <div className="space-y-4">
              {summary.expenseCategories.slice(0, 4).map((category) => (
                <div key={category.name}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-medium">
                      {category.name}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {money(category.amountMinor)}
                    </span>
                  </div>
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-warning h-full rounded-full"
                      style={{
                        width: `${Math.max(5, (category.amountMinor / maxCategory) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PeriodSnapshot({ report }: { report: SalesReportOverview }) {
  const summary = report.summary;
  const returnRate =
    summary.completedSales > 0
      ? (summary.completedReturns / summary.completedSales) * 100
      : 0;
  const rows: Array<[string, string]> = [
    [
      "Gross margin",
      summary.marginPercent === null
        ? "Unavailable"
        : `${summary.marginPercent.toFixed(1)}%`,
    ],
    ["Average order", reportMoney(summary.averageOrderMinor, report)],
    ["Units sold", summary.unitsSold.toLocaleString(report.locale)],
    ["Return rate", `${returnRate.toFixed(1)}%`],
    ["Refund value", reportMoney(summary.refundTotalMinor, report)],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Period snapshot</CardTitle>
        <p className="text-muted-foreground text-sm">
          Supporting measures for the selected reporting scope.
        </p>
      </CardHeader>
      <CardContent className="divide-y py-0">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-4 py-4 text-sm"
          >
            <span className="text-muted-foreground">{label}</span>
            <span className="font-semibold tabular-nums">{value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ReportLibrary({ tenantSlug }: { tenantSlug: string }) {
  const reports = [
    {
      title: "Sales performance",
      description:
        "Revenue, returns, profit, tender mix, stores, products, and transaction detail.",
      href: `/app/${tenantSlug}/reports/sales`,
      icon: ChartNoAxesCombined,
    },
    {
      title: "Purchasing & expenses",
      description:
        "Approved spend, pending expenses, goods receipts, and open purchase commitments.",
      href: `/app/${tenantSlug}/reports/operations`,
      icon: Banknote,
    },
  ];

  return (
    <section aria-labelledby="report-library-title">
      <div className="mb-4">
        <h2 id="report-library-title" className="text-lg font-semibold">
          Detailed reports
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Open a focused report for complete analysis and export controls.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {reports.map((report) => {
          const Icon = report.icon;
          return (
            <Link key={report.title} href={report.href} className="group">
              <Card variant="interactive" className="h-full">
                <CardContent className="flex h-full items-start gap-4 p-5 sm:p-6">
                  <span className="bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-xl">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold">{report.title}</h3>
                    <p className="text-muted-foreground mt-1.5 text-xs leading-5">
                      {report.description}
                    </p>
                  </div>
                  <ArrowUpRight
                    className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-colors"
                    aria-hidden="true"
                  />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function ReportsOverviewView({
  tenantSlug,
  report,
  operations,
  range,
  isDemo,
}: {
  tenantSlug: string;
  report: SalesReportOverview;
  operations: OperationsSummary;
  range: ReportsOverviewRange;
  isDemo: boolean;
}) {
  const summary = report.summary;
  const periodEnd = new Date(new Date(report.periodEnd).getTime() - 1);
  const formatter = new Intl.DateTimeFormat(report.locale, {
    dateStyle: "medium",
    timeZone: report.timezone,
  });
  const periodLabel = `${formatter.format(new Date(report.periodStart))} – ${formatter.format(periodEnd)}`;

  return (
    <PageContainer>
      <ReportsNav tenantSlug={tenantSlug} current="/reports" />
      <PageStatus
        tone={isDemo ? "demo" : "live"}
        label={isDemo ? "Demo data" : "Live tenant data"}
        detail={`${report.rangeLabel} · ${report.selectedStoreId === "all" ? "All assigned stores" : "Selected store"}`}
      />
      <PageHeader
        eyebrow="Reports"
        title="Reports overview"
        description="Monitor sales, profitability, store contribution, product performance, purchasing, and operating spend from one reporting workspace."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/app/${tenantSlug}/reports/operations`}>
                <Banknote /> Operations report
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/app/${tenantSlug}/reports/sales`}>
                <ChartNoAxesCombined /> Sales report
              </Link>
            </Button>
          </>
        }
      />

      <Card>
        <ReportsOverviewToolbar
          range={range}
          selectedStoreId={report.selectedStoreId}
          stores={report.stores}
        />
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">{periodLabel}</p>
        <p className="text-muted-foreground text-xs">
          Updated {reportDate(report.asOf, report)}
        </p>
      </div>

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Reports overview summary"
      >
        <MetricCard
          label="Net sales"
          value={reportCompactMoney(summary.netSalesMinor, report)}
          detail="After discounts and return value"
          icon={CircleDollarSign}
          emphasis
        />
        <MetricCard
          label="Gross profit"
          value={
            summary.grossProfitMinor === null
              ? "Unavailable"
              : reportCompactMoney(summary.grossProfitMinor, report)
          }
          detail={
            summary.marginPercent === null
              ? "Complete costs required"
              : `${summary.marginPercent.toFixed(1)}% gross margin`
          }
          icon={TrendingUp}
          tone={summary.grossProfitMinor === null ? "muted" : "success"}
        />
        <MetricCard
          label="Completed orders"
          value={summary.completedSales.toLocaleString(report.locale)}
          detail={`Average ${reportMoney(summary.averageOrderMinor, report)}`}
          icon={ReceiptText}
          tone="primary"
        />
        <MetricCard
          label="Approved expenses"
          value={formatMoney(
            {
              amountMinor: operations.approvedExpenseMinor,
              currency: operations.currency,
            },
            report.locale,
          )}
          detail={`${operations.expenseCount.toLocaleString(report.locale)} reviewed records`}
          icon={Banknote}
          tone="warning"
        />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,0.72fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Performance trend</CardTitle>
            <p className="text-muted-foreground text-sm">
              Returns-aware net sales, estimated gross profit, and refunds.
            </p>
          </CardHeader>
          <SalesReportTrend
            data={report.trend}
            currency={report.currency}
            locale={report.locale}
            rangeLabel={report.rangeLabel}
          />
        </Card>
        <PeriodSnapshot report={report} />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-2">
        <StoreContributionCard report={report} />
        <OperationsSnapshot summary={operations} locale={report.locale} />
      </section>

      <ProductContributionCard report={report} />
      <ReportLibrary tenantSlug={tenantSlug} />

      <p className="text-muted-foreground text-xs leading-5">
        Reporting values are operational summaries, not statutory accounting
        statements. Profit depends on complete recorded cost snapshots; expenses
        enter totals after approval.
      </p>
    </PageContainer>
  );
}
