import {
  BadgeDollarSign,
  CircleDollarSign,
  PackageCheck,
  RotateCcw,
  TrendingUp,
  Download,
} from "lucide-react";
import Link from "next/link";
import { MetricCard } from "@/components/dashboard/metric-card";
import {
  ProductContributionCard,
  StoreContributionCard,
} from "@/components/reports/contribution-cards";
import { MethodMixCard } from "@/components/reports/method-mix-card";
import {
  reportCompactMoney,
  reportDate,
  reportMoney,
} from "@/components/reports/report-format";
import { ReportTransactions } from "@/components/reports/report-transactions";
import { ReportsNav } from "@/components/reports/reports-nav";
import { SalesReportToolbar } from "@/components/reports/sales-report-toolbar";
import { SalesReportTrend } from "@/components/reports/sales-report-trend";
import { PageContainer, PageStatus } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { PrintButton } from "@/components/shared/print-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  SalesReportOverview,
  SalesReportQuery,
} from "@/modules/reports/sales-schemas";

export function SalesReportView({
  tenantSlug,
  report,
  query,
  isDemo,
  canExport,
}: {
  tenantSlug: string;
  report: SalesReportOverview;
  query: SalesReportQuery;
  isDemo: boolean;
  canExport: boolean;
}) {
  const summary = report.summary;
  const periodEnd = new Date(new Date(report.periodEnd).getTime() - 1);
  const dateFormat = new Intl.DateTimeFormat(report.locale, {
    dateStyle: "medium",
    timeZone: report.timezone,
  });
  const periodLabel = `${dateFormat.format(new Date(report.periodStart))} – ${dateFormat.format(periodEnd)}`;
  const accountingRows: Array<[string, number]> = [
    ["Gross merchandise value", summary.grossSalesMinor],
    ["Less discounts", -summary.discountMinor],
    ["Less returned net value", -summary.returnNetMinor],
    ["Net sales before tax", summary.netSalesMinor],
    ["Net tax", summary.taxMinor],
  ];
  const exportParams = new URLSearchParams({
    range: query.range,
    store: query.store,
  });
  const exportHref = `/api/app/${encodeURIComponent(tenantSlug)}/reports/sales/export?${exportParams.toString()}`;

  return (
    <PageContainer>
      <ReportsNav tenantSlug={tenantSlug} current="/reports/sales" />
      <PageStatus
        tone={isDemo ? "demo" : "live"}
        label={isDemo ? "Demo data" : "Live tenant data"}
        detail={
          isDemo
            ? "Read-only reporting preview"
            : "Restricted to your assigned stores"
        }
      />
      <PageHeader
        eyebrow="Reports"
        title="Sales performance"
        description="Understand gross sales, returns, net revenue, profit, payment behavior, and the products and stores driving the period."
        actions={
          <>
            <PrintButton label="Print report" />
            {canExport && !isDemo ? (
              <Button variant="outline" asChild>
                <a href={exportHref} download>
                  <Download /> Export CSV
                </a>
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled
                title={
                  isDemo
                    ? "Exports require a live tenant."
                    : "Your role cannot export reports."
                }
              >
                <Download /> Export CSV
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href={`/app/${tenantSlug}/sales`}>Sales history</Link>
            </Button>
          </>
        }
      />
      <Card>
        <SalesReportToolbar
          range={report.range}
          selectedStoreId={report.selectedStoreId}
          stores={report.stores}
        />
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">{periodLabel}</p>
        <p className="text-muted-foreground text-xs">
          Returns recognized when processed · As of{" "}
          {reportDate(report.asOf, report)}
        </p>
      </div>

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Sales report summary"
      >
        <MetricCard
          label="Gross sales"
          value={reportCompactMoney(summary.grossSalesMinor, report)}
          detail={`${summary.completedSales.toLocaleString()} completed order${summary.completedSales === 1 ? "" : "s"}`}
          icon={CircleDollarSign}
        />
        <MetricCard
          label="Net sales"
          value={reportCompactMoney(summary.netSalesMinor, report)}
          detail="After discounts and return value"
          icon={TrendingUp}
          tone={summary.netSalesMinor >= 0 ? "success" : "warning"}
        />
        <MetricCard
          label="Refunds"
          value={reportCompactMoney(summary.refundTotalMinor, report)}
          detail={`${summary.completedReturns.toLocaleString()} processed return${summary.completedReturns === 1 ? "" : "s"} · includes tax`}
          icon={RotateCcw}
          tone={summary.refundTotalMinor > 0 ? "warning" : "muted"}
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
              ? "Complete cost snapshots required"
              : `${summary.marginPercent.toFixed(1)}% margin`
          }
          icon={BadgeDollarSign}
          tone={summary.grossProfitMinor === null ? "muted" : "primary"}
        />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Performance trend</CardTitle>
            <p className="text-muted-foreground text-sm">
              Sales and return events grouped by the company timezone.
            </p>
          </CardHeader>
          <SalesReportTrend
            data={report.trend}
            currency={report.currency}
            locale={report.locale}
            rangeLabel={report.rangeLabel}
          />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Period accounting</CardTitle>
            <p className="text-muted-foreground text-sm">
              A transparent bridge from gross to net.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {accountingRows.map(([label, value], index) => (
              <div
                key={label}
                className={`flex items-center justify-between gap-4 text-sm ${index === 3 ? "border-t pt-4 font-semibold" : ""}`}
              >
                <span className="text-muted-foreground">{label}</span>
                <span className="shrink-0 font-medium tabular-nums">
                  {reportMoney(value, report)}
                </span>
              </div>
            ))}
            <div className="bg-muted/50 rounded-lg p-3 text-xs leading-5">
              Average net value per completed order:{" "}
              <strong>{reportMoney(summary.averageOrderMinor, report)}</strong>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <MethodMixCard
          title="Tender mix"
          description="Applied payment value, including tax, for sales completed in this period."
          rows={report.paymentMethods}
          report={report}
        />
        <MethodMixCard
          title="Refund method mix"
          description="Recorded refund value, including tax, for returns processed in this period."
          rows={report.refundMethods}
          report={report}
        />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <StoreContributionCard report={report} />
        <ProductContributionCard report={report} />
      </section>

      <ReportTransactions
        tenantSlug={tenantSlug}
        report={report}
        query={query}
        isDemo={isDemo}
      />
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <PackageCheck className="size-3.5" /> Product and profit contribution
        use immutable sale and return snapshots.
      </p>
    </PageContainer>
  );
}
