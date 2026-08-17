import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  ReceiptText,
  RotateCcw,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DownloadReceiptButton } from "@/components/sales/download-receipt-button";
import { PrintReceiptButton } from "@/components/sales/print-receipt-button";
import { VoidSaleDialog } from "@/components/sales/void-sale-dialog";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
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
import { hasPermission } from "@/modules/permissions/permissions";
import { receiptIdSchema, salePaymentLabels } from "@/modules/sales/schemas";
import { SaleReturnRepository } from "@/server/repositories/sale-returns";
import { SaleRepository } from "@/server/repositories/sales";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Sale receipt" };

function money(amountMinor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export default async function SaleReceiptPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; saleId: string }>;
}) {
  if (!env.MONGODB_URI) notFound();
  const { tenantSlug, saleId: untrustedSaleId } = await params;
  const parsed = receiptIdSchema.safeParse(untrustedSaleId);
  if (!parsed.success) notFound();
  let receipt = null;
  let returnWorkspace = null;
  let canVoid = false;
  try {
    const context = await requireTenantContext(tenantSlug);
    receipt = await new SaleRepository().receipt(context, parsed.data);
    canVoid = hasPermission(context.permissions, "sale:void");
    if (
      receipt?.status === "completed" &&
      hasPermission(context.permissions, "sale:refund")
    )
      returnWorkspace = await new SaleReturnRepository().workspace(
        context,
        parsed.data,
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
          eyebrow="Sales"
          parentHref={`/app/${tenantSlug}/sales/new`}
          title={receipt.status === "voided" ? "Sale voided" : "Sale completed"}
          description={
            receipt.status === "voided"
              ? "The receipt and recorded tenders are voided, and tracked inventory has been restored."
              : "Inventory, payment records, and the receipt were committed together."
          }
          actions={
            <>
              <PrintReceiptButton saleId={receipt.id} />
              <DownloadReceiptButton receiptNumber={receipt.receiptNumber} />
              {receipt.status === "completed" && canVoid && (
                <VoidSaleDialog
                  tenantSlug={tenantSlug}
                  saleId={receipt.id}
                  receiptNumber={receipt.receiptNumber}
                />
              )}
              {returnWorkspace?.lines.some(
                (line) => line.remainingQuantity > 0,
              ) && (
                <Button variant="outline" asChild>
                  <Link href={`/app/${tenantSlug}/sales/${receipt.id}/return`}>
                    <RotateCcw /> Return items
                  </Link>
                </Button>
              )}
              <Button asChild>
                <Link href={`/app/${tenantSlug}/sales/new`}>
                  <ArrowLeft /> New sale
                </Link>
              </Button>
            </>
          }
        />
      </div>
      <Card data-sale-bill className="print:border-0">
        <CardHeader data-receipt-header className="gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
                <ReceiptText className="size-5" />
              </span>
              <div className="min-w-0">
                <CardTitle className="break-words">
                  {receipt.businessName}
                </CardTitle>
                <CardDescription className="break-words">
                  {receipt.store.name} · {receipt.store.code}
                </CardDescription>
                {(receipt.store.address || receipt.businessAddress) && (
                  <p className="text-muted-foreground mt-1 max-w-sm text-xs leading-5">
                    {receipt.store.address || receipt.businessAddress}
                  </p>
                )}
                {receipt.businessPhone && (
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {receipt.businessPhone}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div data-receipt-header-meta className="text-left">
            <Badge
              variant={receipt.status === "voided" ? "secondary" : "success"}
            >
              {receipt.status === "voided" ? <Ban /> : <CheckCircle2 />}
              {receipt.status === "voided" ? "Voided" : "Completed"}
            </Badge>
            <p className="mt-2 font-mono text-sm font-semibold break-all">
              {receipt.receiptNumber}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">{completedAt}</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {receipt.status === "voided" && (
            <div className="bg-destructive/8 border-destructive/20 rounded-xl border p-4">
              <p className="text-sm font-semibold">Voided receipt</p>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                {receipt.voidReason}
              </p>
            </div>
          )}
          <Inset data-receipt-customer-summary className="grid gap-3 p-4">
            <div>
              <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                Customer
              </p>
              <p className="mt-1 text-sm font-medium">
                {receipt.customer?.name ?? "Walk-in customer"}
              </p>
              {receipt.customer && (
                <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                  {receipt.customer.code}
                </p>
              )}
            </div>
            <div data-receipt-customer-meta>
              <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                Receipt
              </p>
              <p className="mt-1 font-mono text-sm font-semibold break-all">
                {receipt.receiptNumber}
              </p>
            </div>
          </Inset>

          <Inset className="divide-y">
            {receipt.lines.map((line) => (
              <div
                key={line.lineId}
                data-receipt-line
                className="flex min-w-0 flex-col gap-2 p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{line.productName}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {line.variantName === "Default"
                      ? line.sku
                      : `${line.variantName} · ${line.sku}`}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {line.quantity} ×{" "}
                    {money(
                      line.unitPriceMinor,
                      receipt.currency,
                      receipt.locale,
                    )}
                    {line.discountMinor > 0
                      ? ` · ${line.discountBps / 100}% discount`
                      : ""}
                  </p>
                </div>
                <p
                  data-receipt-line-total
                  className="font-semibold tabular-nums"
                >
                  {money(line.lineTotalMinor, receipt.currency, receipt.locale)}
                </p>
              </div>
            ))}
          </Inset>

          <div data-receipt-payment-summary className="grid gap-6">
            <div>
              <h2 className="text-sm font-semibold">Payment record</h2>
              <div className="mt-3 space-y-2">
                {receipt.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="text-muted-foreground">
                      {salePaymentLabels[payment.method]}
                    </span>
                    <span className="tabular-nums">
                      {money(
                        payment.tenderedMinor,
                        receipt.currency,
                        receipt.locale,
                      )}
                    </span>
                  </div>
                ))}
                {receipt.changeMinor > 0 && (
                  <div className="flex items-center justify-between gap-4 border-t pt-2 text-sm font-medium">
                    <span>Change</span>
                    <span className="tabular-nums">
                      {money(
                        receipt.changeMinor,
                        receipt.currency,
                        receipt.locale,
                      )}
                    </span>
                  </div>
                )}
              </div>
              {receipt.note && (
                <div className="mt-5">
                  <h2 className="text-sm font-semibold">Note</h2>
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
                <span className="text-muted-foreground">Discounts</span>
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
                <span className="text-muted-foreground">Tax</span>
                <span className="tabular-nums">
                  {money(receipt.taxMinor, receipt.currency, receipt.locale)}
                </span>
              </div>
              <div className="flex justify-between gap-4 border-t pt-3 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">
                  {money(receipt.totalMinor, receipt.currency, receipt.locale)}
                </span>
              </div>
            </Inset>
          </div>

          {returnWorkspace && returnWorkspace.previousReturns.length > 0 && (
            <div data-receipt-print-hidden className="print:hidden">
              <h2 className="text-sm font-semibold">Returns</h2>
              <Inset className="mt-3 divide-y">
                {returnWorkspace.previousReturns.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-mono text-sm font-semibold">
                        {item.returnNumber}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {item.unitCount} returned unit
                        {item.unitCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <span className="text-sm font-semibold tabular-nums">
                        {money(
                          item.totalMinor,
                          receipt.currency,
                          receipt.locale,
                        )}
                      </span>
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          href={`/app/${tenantSlug}/sales/${receipt.id}/returns/${item.id}`}
                        >
                          View return
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </Inset>
            </div>
          )}
          <div className="border-t pt-4 text-center">
            <p className="text-sm font-semibold">Thank you for your purchase</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Keep this bill for returns and order verification.
            </p>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
