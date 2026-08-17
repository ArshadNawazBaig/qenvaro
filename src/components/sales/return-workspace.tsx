"use client";

import {
  CheckCircle2,
  Minus,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  completeSaleReturnAction,
  type SaleReturnActionState,
} from "@/app/app/[tenantSlug]/sales/[saleId]/return/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SelectField } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { calculateSaleReturn } from "@/modules/sales/return-policy";
import {
  saleReturnReasonLabels,
  type SaleReturnReason,
  type SaleReturnWorkspace,
} from "@/modules/sales/return-schemas";
import {
  salePaymentLabels,
  type SalePaymentMethod,
} from "@/modules/sales/schemas";

const initialState: SaleReturnActionState = { status: "idle", message: "" };

function money(amountMinor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function ReturnWorkspace({
  tenantSlug,
  workspace,
  activeStoreMatches,
}: {
  tenantSlug: string;
  workspace: SaleReturnWorkspace;
  activeStoreMatches: boolean;
}) {
  const router = useRouter();
  const [quantities, setQuantities] = React.useState<Record<string, number>>(
    {},
  );
  const [refundMethod, setRefundMethod] =
    React.useState<SalePaymentMethod>("cash");
  const [reason, setReason] =
    React.useState<SaleReturnReason>("customer_request");
  const [requestKey] = React.useState(() => `return:${crypto.randomUUID()}`);
  const [state, action, pending] = React.useActionState(
    completeSaleReturnAction.bind(null, tenantSlug),
    initialState,
  );

  const selectedLines = workspace.lines
    .filter((line) => (quantities[line.lineId] ?? 0) > 0)
    .map((line) => ({
      saleLineId: line.lineId,
      quantity: quantities[line.lineId] ?? 0,
      expectedLevelVersion: line.levelVersion,
    }));
  const estimate = React.useMemo(() => {
    try {
      return selectedLines.length > 0
        ? calculateSaleReturn(workspace.lines, selectedLines)
        : null;
    } catch {
      return null;
    }
  }, [selectedLines, workspace.lines]);

  React.useEffect(() => {
    if (state.status !== "success" || !state.saleId || !state.returnId) return;
    toast.success(state.message);
    router.push(
      `/app/${tenantSlug}/sales/${state.saleId}/returns/${state.returnId}`,
    );
  }, [router, state, tenantSlug]);

  const remainingLines = workspace.lines.filter(
    (line) => line.remainingQuantity > 0,
  );
  const allReturned = remainingLines.length === 0;

  function setQuantity(lineId: string, quantity: number, maximum: number) {
    setQuantities((current) => {
      if (quantity <= 0) {
        const next = { ...current };
        delete next[lineId];
        return next;
      }
      return {
        ...current,
        [lineId]: Math.min(maximum, Math.max(1, quantity)),
      };
    });
  }

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Original receipt</CardTitle>
            <CardDescription>
              {workspace.sale.receiptNumber} · {workspace.store.name} ·{" "}
              {workspace.sale.customerName}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground text-xs">Original total</p>
              <p className="mt-1 font-semibold tabular-nums">
                {money(
                  workspace.sale.totalMinor,
                  workspace.currency,
                  workspace.locale,
                )}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">
                Previously returned
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {money(
                  workspace.returnedTotalMinor,
                  workspace.currency,
                  workspace.locale,
                )}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Remaining value</p>
              <p className="mt-1 font-semibold tabular-nums">
                {money(
                  workspace.remainingTotalMinor,
                  workspace.currency,
                  workspace.locale,
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Select returned items</CardTitle>
            <CardDescription>
              Refund values are allocated from the original line discount and
              tax snapshots.
            </CardDescription>
          </CardHeader>
          {allReturned ? (
            <CardContent className="text-muted-foreground flex min-h-56 flex-col items-center justify-center text-center">
              <CheckCircle2 className="size-8" />
              <p className="mt-4 font-medium">Everything was returned</p>
              <p className="mt-1 max-w-sm text-sm">
                This receipt has no remaining units available for another
                return.
              </p>
            </CardContent>
          ) : (
            <div className="divide-y">
              {workspace.lines.map((line) => {
                const quantity = quantities[line.lineId] ?? 0;
                const unavailable = line.remainingQuantity === 0;
                return (
                  <div
                    key={line.lineId}
                    className="flex min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:px-6"
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="border-input mt-0.5 size-4 rounded"
                        checked={quantity > 0}
                        disabled={unavailable}
                        onChange={(event) =>
                          setQuantity(
                            line.lineId,
                            event.target.checked ? 1 : 0,
                            line.remainingQuantity,
                          )
                        }
                        aria-label={`Return ${line.productName}`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {line.productName}
                        </span>
                        <span className="text-muted-foreground mt-0.5 block truncate font-mono text-xs">
                          {line.variantName === "Default"
                            ? line.sku
                            : `${line.variantName} · ${line.sku}`}
                        </span>
                        <span className="text-muted-foreground mt-1 block text-xs">
                          {line.returnedQuantity} returned ·{" "}
                          {line.remainingQuantity} remaining
                        </span>
                      </span>
                    </label>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <span className="text-sm font-medium tabular-nums">
                        {money(
                          line.lineTotalMinor,
                          workspace.currency,
                          workspace.locale,
                        )}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8"
                          disabled={quantity <= 0}
                          onClick={() =>
                            setQuantity(
                              line.lineId,
                              quantity - 1,
                              line.remainingQuantity,
                            )
                          }
                          aria-label={`Decrease ${line.productName} return quantity`}
                        >
                          <Minus />
                        </Button>
                        <span className="min-w-9 text-center text-sm font-semibold tabular-nums">
                          {quantity}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8"
                          disabled={
                            unavailable || quantity >= line.remainingQuantity
                          }
                          onClick={() =>
                            setQuantity(
                              line.lineId,
                              quantity + 1,
                              line.remainingQuantity,
                            )
                          }
                          aria-label={`Increase ${line.productName} return quantity`}
                        >
                          <Plus />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {workspace.previousReturns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Previous returns</CardTitle>
              <CardDescription>
                Earlier completed returns against this receipt.
              </CardDescription>
            </CardHeader>
            <div className="divide-y">
              {workspace.previousReturns.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                >
                  <div>
                    <p className="font-mono text-sm font-semibold">
                      {item.returnNumber}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {item.unitCount} units ·{" "}
                      {saleReturnReasonLabels[item.reason]}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <span className="text-sm font-semibold tabular-nums">
                      {money(
                        item.totalMinor,
                        workspace.currency,
                        workspace.locale,
                      )}
                    </span>
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        href={`/app/${tenantSlug}/sales/${workspace.sale.id}/returns/${item.id}`}
                      >
                        Receipt
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <form action={action} className="min-w-0">
        <input type="hidden" name="saleId" value={workspace.sale.id} />
        <input type="hidden" name="storeId" value={workspace.store.id} />
        <input
          type="hidden"
          name="linesJson"
          value={JSON.stringify(selectedLines)}
        />
        <input type="hidden" name="refundMethod" value={refundMethod} />
        <input type="hidden" name="reason" value={reason} />
        <input type="hidden" name="idempotencyKey" value={requestKey} />
        <Card className="xl:sticky xl:top-[92px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="size-4" /> Return summary
            </CardTitle>
            <CardDescription>
              Stock and refund evidence commit together.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!activeStoreMatches && (
              <div className="bg-warning/20 rounded-lg p-3 text-sm leading-6">
                Switch the active store to {workspace.store.name} before
                completing this return.
              </div>
            )}
            <label className="block space-y-1.5 text-sm font-medium">
              Return reason
              <SelectField
                ariaLabel="Return reason"
                value={reason}
                onValueChange={(value) => setReason(value as SaleReturnReason)}
                options={Object.entries(saleReturnReasonLabels).map(
                  ([value, label]) => ({ value, label }),
                )}
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Recorded refund method
              <SelectField
                ariaLabel="Refund method"
                value={refundMethod}
                onValueChange={(value) =>
                  setRefundMethod(value as SalePaymentMethod)
                }
                options={Object.entries(salePaymentLabels).map(
                  ([value, label]) => ({ value, label }),
                )}
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Return note{" "}
              <span className="text-muted-foreground">
                {reason === "other" ? "(required)" : "(optional)"}
              </span>
              <Textarea
                name="note"
                maxLength={500}
                minLength={reason === "other" ? 3 : undefined}
                required={reason === "other"}
                rows={3}
                placeholder="Internal return note"
              />
            </label>

            <div className="space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Selected units</span>
                <span className="tabular-nums">
                  {selectedLines.reduce((sum, line) => sum + line.quantity, 0)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">
                  {money(
                    estimate?.subtotalMinor ?? 0,
                    workspace.currency,
                    workspace.locale,
                  )}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Discount reversal</span>
                <span className="tabular-nums">
                  −
                  {money(
                    estimate?.discountMinor ?? 0,
                    workspace.currency,
                    workspace.locale,
                  )}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Tax reversal</span>
                <span className="tabular-nums">
                  {money(
                    estimate?.taxMinor ?? 0,
                    workspace.currency,
                    workspace.locale,
                  )}
                </span>
              </div>
              <div className="flex justify-between gap-4 border-t pt-3 text-base font-semibold">
                <span>Estimated refund</span>
                <span className="tabular-nums">
                  {money(
                    estimate?.totalMinor ?? 0,
                    workspace.currency,
                    workspace.locale,
                  )}
                </span>
              </div>
              <p className="text-muted-foreground text-[11px] leading-5">
                Remaining quantities, original allocations, inventory version,
                and refund value are recalculated on the server.
              </p>
            </div>

            {state.message && state.status !== "success" && (
              <p
                role="alert"
                className={
                  state.status === "conflict"
                    ? "bg-warning/20 rounded-lg p-3 text-sm"
                    : "border-destructive/25 bg-destructive/10 text-foreground rounded-lg border p-3 text-sm"
                }
              >
                {state.message}
              </p>
            )}
            {state.status === "conflict" && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => window.location.reload()}
              >
                <RefreshCw /> Reload return
              </Button>
            )}
          </CardContent>
          <CardFooter className="flex-col items-stretch">
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={
                pending ||
                allReturned ||
                !activeStoreMatches ||
                !estimate ||
                selectedLines.length === 0 ||
                !requestKey
              }
            >
              <RotateCcw />
              {pending ? "Completing return…" : "Complete return & refund"}
            </Button>
            <Button type="button" variant="ghost" asChild>
              <Link href={`/app/${tenantSlug}/sales/${workspace.sale.id}`}>
                <ReceiptText /> Back to original receipt
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
