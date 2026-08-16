import { ArrowRight, ReceiptText } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  SalesReportOverview,
  SalesReportQuery,
  SalesReportTransaction,
} from "@/modules/reports/sales-schemas";
import { reportDate, reportMoney } from "./report-format";

function pageHref(query: SalesReportQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.range !== "30d") params.set("range", query.range);
  if (query.store !== "all") params.set("store", query.store);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `?${suffix}` : "?";
}

function TransactionAction({
  transaction,
  tenantSlug,
  isDemo,
}: {
  transaction: SalesReportTransaction;
  tenantSlug: string;
  isDemo: boolean;
}) {
  if (isDemo)
    return (
      <Button size="sm" variant="outline" disabled>
        Preview
      </Button>
    );
  const href =
    transaction.type === "sale"
      ? `/app/${tenantSlug}/sales/${transaction.saleId}`
      : `/app/${tenantSlug}/sales/${transaction.saleId}/returns/${transaction.id}`;
  return (
    <Button size="sm" variant="outline" asChild>
      <Link href={href}>
        View <ArrowRight />
      </Link>
    </Button>
  );
}

export function ReportTransactions({
  tenantSlug,
  report,
  query,
  isDemo,
}: {
  tenantSlug: string;
  report: SalesReportOverview;
  query: SalesReportQuery;
  isDemo: boolean;
}) {
  const pageCount = Math.max(
    1,
    Math.ceil(report.transactions.total / report.transactions.pageSize),
  );
  const items = report.transactions.items;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Period transactions</CardTitle>
        <p className="text-muted-foreground text-sm">
          A bounded drill-down of completed sales and processed returns.
        </p>
      </CardHeader>
      {items.length === 0 ? (
        <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
          <ReceiptText className="text-muted-foreground size-8" />
          <p className="mt-4 font-medium">No transactions in this view</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Change the period or store selection to broaden the report.
          </p>
        </CardContent>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
                <tr>
                  <th className="px-5 py-3 font-medium sm:px-6">Reference</th>
                  <th className="px-4 py-3 font-medium">Store</th>
                  <th className="px-4 py-3 font-medium">Customer / source</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3 text-right font-medium sm:px-6">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((transaction) => (
                  <tr key={`${transaction.type}-${transaction.id}`}>
                    <td className="px-5 py-4 sm:px-6">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            transaction.type === "sale" ? "success" : "warning"
                          }
                        >
                          {transaction.type === "sale" ? "Sale" : "Return"}
                        </Badge>
                        <span className="font-mono font-semibold">
                          {transaction.reference}
                        </span>
                      </div>
                      {transaction.relatedReference && (
                        <p className="text-muted-foreground mt-1 text-xs">
                          Original {transaction.relatedReference}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">{transaction.storeName}</td>
                    <td className="px-4 py-4">{transaction.customerName}</td>
                    <td className="text-muted-foreground px-4 py-4 text-xs">
                      {reportDate(transaction.occurredAt, report)}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold tabular-nums">
                      {transaction.type === "return" ? "−" : ""}
                      {reportMoney(transaction.amountMinor, report)}
                    </td>
                    <td className="px-5 py-4 text-right sm:px-6">
                      <TransactionAction
                        transaction={transaction}
                        tenantSlug={tenantSlug}
                        isDemo={isDemo}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y md:hidden">
            {items.map((transaction) => (
              <article
                key={`${transaction.type}-${transaction.id}`}
                className="p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          transaction.type === "sale" ? "success" : "warning"
                        }
                      >
                        {transaction.type === "sale" ? "Sale" : "Return"}
                      </Badge>
                      <p className="truncate font-mono text-sm font-semibold">
                        {transaction.reference}
                      </p>
                    </div>
                    <p className="text-muted-foreground mt-2 truncate text-xs">
                      {transaction.storeName} · {transaction.customerName}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">
                    {transaction.type === "return" ? "−" : ""}
                    {reportMoney(transaction.amountMinor, report)}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-muted-foreground text-xs">
                    {reportDate(transaction.occurredAt, report)}
                  </p>
                  <TransactionAction
                    transaction={transaction}
                    tenantSlug={tenantSlug}
                    isDemo={isDemo}
                  />
                </div>
              </article>
            ))}
          </div>
          <CardFooter className="justify-between">
            <p className="text-muted-foreground text-xs">
              {report.transactions.total.toLocaleString()} event
              {report.transactions.total === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={report.transactions.page <= 1}
                asChild={report.transactions.page > 1}
              >
                {report.transactions.page > 1 ? (
                  <Link href={pageHref(query, report.transactions.page - 1)}>
                    Previous
                  </Link>
                ) : (
                  <span>Previous</span>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={report.transactions.page >= pageCount}
                asChild={report.transactions.page < pageCount}
              >
                {report.transactions.page < pageCount ? (
                  <Link href={pageHref(query, report.transactions.page + 1)}>
                    Next
                  </Link>
                ) : (
                  <span>Next</span>
                )}
              </Button>
            </div>
          </CardFooter>
        </>
      )}
    </Card>
  );
}
