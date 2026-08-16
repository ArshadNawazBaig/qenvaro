import { ArrowRight, ReceiptText } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import type {
  SaleHistoryItem,
  SalesHistoryQuery,
} from "@/modules/sales/return-schemas";

function money(amountMinor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function date(value: string, locale: string, timezone: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function status(sale: SaleHistoryItem): {
  label: string;
  variant: "success" | "warning" | "secondary";
} {
  if (sale.returnedTotalMinor >= sale.totalMinor)
    return { label: "Fully returned", variant: "secondary" };
  if (sale.returnedTotalMinor > 0)
    return { label: "Partially returned", variant: "warning" };
  return { label: "Completed", variant: "success" };
}

function pageHref(query: SalesHistoryQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `?${suffix}` : "?";
}

function ReceiptAction({
  tenantSlug,
  sale,
  isDemo,
}: {
  tenantSlug: string;
  sale: SaleHistoryItem;
  isDemo: boolean;
}) {
  return isDemo ? (
    <Button size="sm" variant="outline" disabled>
      Demo receipt
    </Button>
  ) : (
    <Button size="sm" variant="outline" asChild>
      <Link href={`/app/${tenantSlug}/sales/${sale.id}`}>
        View <ArrowRight />
      </Link>
    </Button>
  );
}

export function SalesHistory({
  tenantSlug,
  items,
  total,
  page,
  pageCount,
  query,
  locale,
  timezone,
  isDemo,
}: {
  tenantSlug: string;
  items: SaleHistoryItem[];
  total: number;
  page: number;
  pageCount: number;
  query: SalesHistoryQuery;
  locale: string;
  timezone: string;
  isDemo: boolean;
}) {
  if (items.length === 0)
    return (
      <CardContent className="text-muted-foreground flex min-h-72 flex-col items-center justify-center text-center">
        <ReceiptText className="size-8" />
        <p className="mt-4 font-medium">No completed sales found</p>
        <p className="mt-1 max-w-sm text-sm">
          Complete a sale or try another receipt or customer search.
        </p>
      </CardContent>
    );

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
            <tr>
              <th className="px-5 py-3 font-medium sm:px-6">Receipt</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Items</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-5 py-3 text-right font-medium sm:px-6">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((sale) => {
              const saleStatus = status(sale);
              return (
                <tr key={sale.id}>
                  <td className="px-5 py-4 sm:px-6">
                    <p className="font-mono font-semibold">
                      {sale.receiptNumber}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {sale.storeName} ·{" "}
                      {date(sale.completedAt, locale, timezone)}
                    </p>
                  </td>
                  <td className="px-4 py-4">{sale.customerName}</td>
                  <td className="px-4 py-4">
                    {sale.unitCount} unit{sale.unitCount === 1 ? "" : "s"}
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold tabular-nums">
                      {money(sale.totalMinor, sale.currency, locale)}
                    </p>
                    {sale.returnedTotalMinor > 0 && (
                      <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                        {money(sale.returnedTotalMinor, sale.currency, locale)}{" "}
                        returned
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={saleStatus.variant}>
                      {saleStatus.label}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-right sm:px-6">
                    <ReceiptAction
                      tenantSlug={tenantSlug}
                      sale={sale}
                      isDemo={isDemo}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="divide-y md:hidden">
        {items.map((sale) => {
          const saleStatus = status(sale);
          return (
            <article key={sale.id} className="min-w-0 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-semibold">
                    {sale.receiptNumber}
                  </p>
                  <p className="text-muted-foreground mt-1 truncate text-xs">
                    {sale.customerName} · {sale.storeName}
                  </p>
                </div>
                <Badge variant={saleStatus.variant}>{saleStatus.label}</Badge>
              </div>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <p className="font-semibold tabular-nums">
                    {money(sale.totalMinor, sale.currency, locale)}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {sale.unitCount} units ·{" "}
                    {date(sale.completedAt, locale, timezone)}
                  </p>
                </div>
                <ReceiptAction
                  tenantSlug={tenantSlug}
                  sale={sale}
                  isDemo={isDemo}
                />
              </div>
            </article>
          );
        })}
      </div>
      <CardFooter className="justify-between">
        <p className="text-muted-foreground text-xs">
          {total.toLocaleString()} completed sale{total === 1 ? "" : "s"}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            asChild={page > 1}
          >
            {page > 1 ? (
              <Link href={pageHref(query, page - 1)}>Previous</Link>
            ) : (
              <span>Previous</span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            asChild={page < pageCount}
          >
            {page < pageCount ? (
              <Link href={pageHref(query, page + 1)}>Next</Link>
            ) : (
              <span>Next</span>
            )}
          </Button>
        </div>
      </CardFooter>
    </>
  );
}
