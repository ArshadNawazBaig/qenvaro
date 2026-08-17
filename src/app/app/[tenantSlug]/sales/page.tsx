import { CircleDollarSign, ReceiptText, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageContainer, PageStatus } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { SalesHistory } from "@/components/sales/sales-history";
import { SalesHistoryToolbar } from "@/components/sales/sales-history-toolbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { env } from "@/config/env";
import { hasPermission } from "@/modules/permissions/permissions";
import { getDemoSalesHistory } from "@/modules/sales/return-demo-data";
import { salesHistoryQuerySchema } from "@/modules/sales/return-schemas";
import { SaleReturnRepository } from "@/server/repositories/sale-returns";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Sales history" };

export default async function SalesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const query = salesHistoryQuerySchema.parse(await searchParams);
  let result = getDemoSalesHistory(query);
  let isDemo = true;
  let permissionDenied = false;

  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      isDemo = false;
      if (!hasPermission(context.permissions, "sale:read")) {
        permissionDenied = true;
        result = { ...result, items: [], total: 0 };
      } else {
        result = await new SaleReturnRepository().history(context, query);
      }
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }

  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const page = Math.min(result.page, pageCount);
  const grossMinor = result.items.reduce(
    (sum, sale) => sum + (sale.status === "completed" ? sale.totalMinor : 0),
    0,
  );
  const returnedMinor = result.items.reduce(
    (sum, sale) =>
      sum + (sale.status === "completed" ? sale.returnedTotalMinor : 0),
    0,
  );
  const money = (amountMinor: number) =>
    new Intl.NumberFormat(result.locale, {
      style: "currency",
      currency: result.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);

  return (
    <PageContainer>
      <PageStatus
        tone={isDemo ? "demo" : "live"}
        label={isDemo ? "Demo data" : "Live tenant data"}
        detail={
          isDemo
            ? "Read-only sales and return-status preview"
            : "Only receipts from assigned stores are shown"
        }
      />
      <PageHeader
        eyebrow="Sales"
        title="Sales history"
        description="Find completed receipts, review recorded returns, and start a controlled return from the original sale."
        actions={
          <Button asChild>
            <Link href={`/app/${tenantSlug}/sales/new`}>New sale</Link>
          </Button>
        }
      />
      {!permissionDenied && (
        <section
          className="grid gap-3 sm:grid-cols-3"
          aria-label="Visible sales summary"
        >
          <MetricCard
            label="Visible receipts"
            value={result.total.toLocaleString()}
            detail="Across assigned stores"
            icon={ReceiptText}
          />
          <MetricCard
            label="Page sales"
            value={money(grossMinor)}
            detail="Completed receipt totals"
            icon={CircleDollarSign}
          />
          <MetricCard
            label="Page returns"
            value={money(returnedMinor)}
            detail="Recorded refund value"
            icon={RotateCcw}
            tone={returnedMinor > 0 ? "warning" : "primary"}
          />
        </section>
      )}
      {permissionDenied ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <ReceiptText className="text-muted-foreground size-8" />
            <h2 className="mt-4 font-semibold">Sales access is restricted</h2>
            <p className="text-muted-foreground mt-1 max-w-md text-sm leading-6">
              Your current role cannot view completed receipts. Ask an owner or
              administrator to update your role.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <SalesHistoryToolbar query={query} />
          <SalesHistory
            tenantSlug={tenantSlug}
            items={result.items}
            total={result.total}
            page={page}
            pageCount={pageCount}
            query={query}
            locale={result.locale}
            timezone={result.timezone}
            isDemo={isDemo}
          />
        </Card>
      )}
    </PageContainer>
  );
}
