import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SalesReportOverview } from "@/modules/reports/sales-schemas";
import { reportMoney } from "./report-format";

export function StoreContributionCard({
  report,
}: {
  report: SalesReportOverview;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Store contribution</CardTitle>
        <p className="text-muted-foreground text-sm">
          Net sales across the selected assigned stores.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {report.storeContribution.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No assigned active stores are available.
          </p>
        ) : (
          report.storeContribution.map((store) => (
            <div key={store.id}>
              <div className="mb-2 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{store.name}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {store.code} · {store.completedSales} orders ·{" "}
                    {store.completedReturns} returns
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {reportMoney(store.netSalesMinor, report)}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                    {store.sharePercent.toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-chart-2 h-full rounded-full"
                  style={{ width: `${Math.min(100, store.sharePercent)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function ProductContributionCard({
  report,
}: {
  report: SalesReportOverview;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Product contribution</CardTitle>
        <p className="text-muted-foreground text-sm">
          Top eight products by returns-aware net sales.
        </p>
      </CardHeader>
      {report.productContribution.length === 0 ? (
        <CardContent className="text-muted-foreground py-14 text-center text-sm">
          Product contribution will appear after the first completed sale.
        </CardContent>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
                <tr>
                  <th className="px-5 py-3 font-medium sm:px-6">Product</th>
                  <th className="px-4 py-3 font-medium">Units</th>
                  <th className="px-4 py-3 font-medium">Returns</th>
                  <th className="px-5 py-3 text-right font-medium sm:px-6">
                    Net sales
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.productContribution.map((product) => (
                  <tr key={product.productId}>
                    <td className="px-5 py-4 font-medium sm:px-6">
                      {product.productName}
                    </td>
                    <td className="px-4 py-4 tabular-nums">
                      {product.unitsSold.toLocaleString()}
                    </td>
                    <td className="px-4 py-4 tabular-nums">
                      {product.unitsReturned.toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-right sm:px-6">
                      <p className="font-semibold tabular-nums">
                        {reportMoney(product.netSalesMinor, report)}
                      </p>
                      {product.grossProfitMinor !== null && (
                        <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                          {reportMoney(product.grossProfitMinor, report)} profit
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y md:hidden">
            {report.productContribution.map((product) => (
              <article key={product.productId} className="p-4">
                <p className="font-medium">{product.productName}</p>
                <div className="mt-3 flex items-end justify-between gap-4">
                  <p className="text-muted-foreground text-xs">
                    {product.unitsSold} sold · {product.unitsReturned} returned
                  </p>
                  <p className="font-semibold tabular-nums">
                    {reportMoney(product.netSalesMinor, report)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
