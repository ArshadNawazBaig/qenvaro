import { ArrowLeft, CheckCircle2, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { PrintReceiptButton } from "@/components/sales/print-receipt-button";
import { PageContainer } from "@/components/shared/page-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Inset } from "@/components/ui/inset";
import { env } from "@/config/env";
import {
  returnIdSchema,
  saleReturnReasonLabels,
} from "@/modules/sales/return-schemas";
import { receiptIdSchema, salePaymentLabels } from "@/modules/sales/schemas";
import { SaleReturnRepository } from "@/server/repositories/sale-returns";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Return receipt" };

function money(amountMinor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export default async function SaleReturnReceiptPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; saleId: string; returnId: string }>;
}) {
  if (!env.MONGODB_URI) notFound();
  const {
    tenantSlug,
    saleId: untrustedSaleId,
    returnId: untrustedReturnId,
  } = await params;
  const saleId = receiptIdSchema.safeParse(untrustedSaleId);
  const returnId = returnIdSchema.safeParse(untrustedReturnId);
  if (!saleId.success || !returnId.success) notFound();
  let receipt = null;
  try {
    const context = await requireTenantContext(tenantSlug);
    receipt = await new SaleReturnRepository().receipt(
      context,
      saleId.data,
      returnId.data,
    );
  } catch {
    notFound();
  }
  if (!receipt) notFound();
  const completedAt = new Intl.DateTimeFormat(receipt.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: receipt.timezone,
  }).format(new Date(receipt.completedAt));

  return (
    <PageContainer size="compact" className="print:max-w-none print:p-0">
      <div className="print:hidden">
        <PageHeader
          eyebrow="Returns"
          parentHref={`/app/${tenantSlug}/sales/${receipt.originalSaleId}`}
          title="Return completed"
          description="The refund record, return receipt, and inventory restoration were committed together."
          actions={
            <>
              <PrintReceiptButton />
              <Button asChild>
                <Link
                  href={`/app/${tenantSlug}/sales/${receipt.originalSaleId}`}
                >
                  <ArrowLeft /> Original receipt
                </Link>
              </Button>
            </>
          }
        />
      </div>
      <Card className="print:border-0">
        <CardHeader className="gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex items-center gap-3">
            <span className="bg-warning/20 text-warning-foreground flex size-10 items-center justify-center rounded-xl">
              <RotateCcw className="size-5" />
            </span>
            <div>
              <CardTitle>{receipt.businessName}</CardTitle>
              <CardDescription>
                {receipt.store.name} · Return receipt
              </CardDescription>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <Badge variant="success">
              <CheckCircle2 /> Completed
            </Badge>
            <p className="mt-2 font-mono text-sm font-semibold">
              {receipt.returnNumber}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">{completedAt}</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Inset className="grid gap-4 p-4 sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                Original receipt
              </p>
              <p className="mt-1 font-mono text-sm font-semibold">
                {receipt.originalReceiptNumber}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                Customer
              </p>
              <p className="mt-1 text-sm font-medium">{receipt.customerName}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                Reason
              </p>
              <p className="mt-1 text-sm font-medium">
                {saleReturnReasonLabels[receipt.reason]}
              </p>
            </div>
          </Inset>

          <Inset className="divide-y">
            {receipt.lines.map((line) => (
              <div
                key={line.lineId}
                className="flex min-w-0 flex-col gap-2 p-4 sm:flex-row sm:items-start"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{line.productName}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {line.variantName === "Default"
                      ? line.sku
                      : `${line.variantName} · ${line.sku}`}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {line.quantity} unit{line.quantity === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="font-semibold tabular-nums sm:text-right">
                  {money(line.lineTotalMinor, receipt.currency, receipt.locale)}
                </p>
              </div>
            ))}
          </Inset>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="text-sm font-semibold">Recorded refund</h2>
              <Inset className="mt-3 flex items-center justify-between gap-4 p-4 text-sm">
                <span className="text-muted-foreground">
                  {salePaymentLabels[receipt.refund.method]}
                </span>
                <span className="font-semibold tabular-nums">
                  {money(
                    receipt.refund.amountMinor,
                    receipt.currency,
                    receipt.locale,
                  )}
                </span>
              </Inset>
              {receipt.note && (
                <div className="mt-5">
                  <h2 className="text-sm font-semibold">Internal note</h2>
                  <p className="text-muted-foreground mt-1 text-sm leading-6">
                    {receipt.note}
                  </p>
                </div>
              )}
            </div>
            <Inset className="space-y-2 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">
                  {money(
                    receipt.subtotalMinor,
                    receipt.currency,
                    receipt.locale,
                  )}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Discount reversal</span>
                <span className="tabular-nums">
                  −
                  {money(
                    receipt.discountMinor,
                    receipt.currency,
                    receipt.locale,
                  )}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Tax reversal</span>
                <span className="tabular-nums">
                  {money(receipt.taxMinor, receipt.currency, receipt.locale)}
                </span>
              </div>
              <div className="flex justify-between gap-4 border-t pt-3 text-base font-semibold">
                <span>Refund total</span>
                <span className="tabular-nums">
                  {money(receipt.totalMinor, receipt.currency, receipt.locale)}
                </span>
              </div>
            </Inset>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
