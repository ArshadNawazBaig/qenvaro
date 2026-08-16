import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  SalesReportMethodMix,
  SalesReportOverview,
} from "@/modules/reports/sales-schemas";
import { salePaymentLabels } from "@/modules/sales/schemas";
import { reportMoney } from "./report-format";

export function MethodMixCard({
  title,
  description,
  rows,
  report,
}: {
  title: string;
  description: string;
  rows: SalesReportMethodMix[];
  report: SalesReportOverview;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-muted-foreground text-sm">{description}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No recorded methods in this period.
          </p>
        ) : (
          rows.map((row) => (
            <div key={row.method}>
              <div className="mb-2 flex items-start justify-between gap-4 text-sm">
                <div>
                  <p className="font-medium">{salePaymentLabels[row.method]}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {row.count.toLocaleString()} record
                    {row.count === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">
                    {reportMoney(row.amountMinor, report)}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                    {row.sharePercent.toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: `${Math.min(100, row.sharePercent)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
