"use client";

import {
  Barcode,
  ChevronLeft,
  ChevronRight,
  Minus,
  PackageOpen,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  completeSaleAction,
  type SaleActionState,
} from "@/app/app/[tenantSlug]/sales/new/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  salePaymentLabels,
  type SaleCatalogItem,
  type SaleCatalogQuery,
  type SalePaymentMethod,
  type SaleWorkspace,
} from "@/modules/sales/schemas";

const initialState: SaleActionState = { status: "idle", message: "" };
const paymentMethods = Object.keys(salePaymentLabels) as SalePaymentMethod[];

interface CartLine {
  item: SaleCatalogItem;
  quantity: number;
  discountPercent: number;
}

interface PaymentDraft {
  key: string;
  method: SalePaymentMethod;
  amount: string;
}

type ScanResponse =
  { ok: true; item: SaleCatalogItem } | { ok: false; message: string };

function formatMoney(amountMinor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function parseMinor(value: string): number | null {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const amount =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}

function lineTotals(line: CartLine) {
  const subtotalMinor = line.item.priceMinor * line.quantity;
  const discountMinor = Math.round(
    (subtotalMinor * line.discountPercent) / 100,
  );
  const netMinor = subtotalMinor - discountMinor;
  const taxMinor = Math.round((netMinor * line.item.taxRateBps) / 10_000);
  return {
    subtotalMinor,
    discountMinor,
    taxMinor,
    totalMinor: netMinor + taxMinor,
  };
}

function ProductTile({
  item,
  inCart,
  add,
  currency,
  locale,
}: {
  item: SaleCatalogItem;
  inCart: boolean;
  add: () => void;
  currency: string;
  locale: string;
}) {
  const unavailable = item.inventoryTracking && (item.quantity ?? 0) <= 0;
  return (
    <Card className="flex min-w-0 flex-col">
      <CardContent className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg border">
            <PackageOpen className="text-muted-foreground size-4" />
          </span>
          <Badge variant={unavailable ? "destructive" : "secondary"}>
            {item.inventoryTracking
              ? `${(item.quantity ?? 0).toLocaleString()} available`
              : "Service"}
          </Badge>
        </div>
        <div className="mt-4 min-w-0">
          <p className="truncate font-semibold">{item.productName}</p>
          {item.variantName !== "Default" && (
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {item.variantName}
            </p>
          )}
          <p className="text-muted-foreground mt-1 truncate font-mono text-[11px]">
            {item.sku} · {item.category}
          </p>
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <p className="text-sm font-semibold tabular-nums">
            {formatMoney(item.priceMinor, currency, locale)}
          </p>
          <Button
            type="button"
            size="sm"
            variant={inCart ? "secondary" : "outline"}
            disabled={unavailable}
            onClick={add}
            aria-label={`Add ${item.productName}${item.variantName === "Default" ? "" : ` ${item.variantName}`}`}
          >
            <Plus /> {inCart ? "Add another" : "Add"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PosWorkspace({
  tenantSlug,
  workspace,
  query,
  disabled,
}: {
  tenantSlug: string;
  workspace: SaleWorkspace;
  query: SaleCatalogQuery;
  disabled: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = React.useState(query.q);
  const [scanCode, setScanCode] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [customerId, setCustomerId] = React.useState("");
  const [payments, setPayments] = React.useState<PaymentDraft[]>([
    { key: "payment-1", method: "cash", amount: "" },
  ]);
  const [printAfterSale, setPrintAfterSale] = React.useState(true);
  const scannerInputRef = React.useRef<HTMLInputElement>(null);
  const [requestKey] = React.useState(() => `sale:${crypto.randomUUID()}`);
  const [state, action, pending] = React.useActionState(
    completeSaleAction.bind(null, tenantSlug),
    initialState,
  );

  React.useEffect(() => {
    if (!disabled && !scanning) scannerInputRef.current?.focus();
  }, [disabled, scanning]);

  React.useEffect(() => {
    if (state.status !== "success" || !state.saleId) return;
    toast.success(state.message);
    const receiptHref = `/app/${tenantSlug}/sales/${state.saleId}`;
    if (printAfterSale) {
      window.sessionStorage.setItem("qenvaro:auto-print-sale", state.saleId);
    }
    router.push(receiptHref);
  }, [printAfterSale, router, state, tenantSlug]);

  function navigateCatalog(next: { q?: string; page?: number }) {
    const searchParams = new URLSearchParams(params.toString());
    if (next.q !== undefined) {
      if (next.q) searchParams.set("q", next.q);
      else searchParams.delete("q");
      searchParams.delete("page");
    }
    if (next.page !== undefined) {
      if (next.page <= 1) searchParams.delete("page");
      else searchParams.set("page", String(next.page));
    }
    router.push(`${pathname}?${searchParams.toString()}`);
  }

  function addItem(item: SaleCatalogItem) {
    setCart((current) => {
      const existing = current.find(
        (line) => line.item.variantId === item.variantId,
      );
      if (!existing)
        return [...current, { item, quantity: 1, discountPercent: 0 }];
      const maximum = item.inventoryTracking
        ? Math.max(1, item.quantity ?? 0)
        : 1_000_000;
      return current.map((line) =>
        line.item.variantId === item.variantId
          ? {
              ...line,
              item,
              quantity: Math.min(maximum, line.quantity + 1),
            }
          : line,
      );
    });
  }

  async function scanItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = scanCode.trim();
    if (!code || scanning || disabled) return;
    setScanning(true);
    try {
      const response = await fetch(
        `/api/app/${encodeURIComponent(tenantSlug)}/sales/scan?code=${encodeURIComponent(code)}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as ScanResponse;
      if (!response.ok || !result.ok) {
        toast.error(
          result.ok
            ? "The scanned item is unavailable."
            : result.message || "No product matched this barcode.",
        );
        return;
      }
      const item = result.item;
      if (item.inventoryTracking && (item.quantity ?? 0) <= 0) {
        toast.error(`${item.productName} is out of stock at this store.`);
        return;
      }
      const existing = cart.find(
        (line) => line.item.variantId === item.variantId,
      );
      if (
        existing &&
        item.inventoryTracking &&
        existing.quantity >= (item.quantity ?? 0)
      ) {
        toast.error(
          `Only ${(item.quantity ?? 0).toLocaleString()} unit${item.quantity === 1 ? " is" : "s are"} available.`,
        );
        return;
      }
      addItem(item);
      setScanCode("");
      toast.success(`${item.productName} added to the sale.`);
    } catch {
      toast.error("The barcode could not be scanned right now.");
    } finally {
      setScanning(false);
    }
  }

  function updateLine(variantId: string, changes: Partial<CartLine>) {
    setCart((current) =>
      current.map((line) =>
        line.item.variantId === variantId ? { ...line, ...changes } : line,
      ),
    );
  }

  const totals = cart.reduce(
    (summary, line) => {
      const next = lineTotals(line);
      return {
        subtotalMinor: summary.subtotalMinor + next.subtotalMinor,
        discountMinor: summary.discountMinor + next.discountMinor,
        taxMinor: summary.taxMinor + next.taxMinor,
        totalMinor: summary.totalMinor + next.totalMinor,
      };
    },
    { subtotalMinor: 0, discountMinor: 0, taxMinor: 0, totalMinor: 0 },
  );
  const paymentValues = payments.map((payment) => parseMinor(payment.amount));
  const paymentsValid = paymentValues.every((amount) => amount !== null);
  const linesJson = JSON.stringify(
    cart.map((line) => ({
      variantId: line.item.variantId,
      quantity: line.quantity,
      discountBps: line.discountPercent * 100,
      expectedLevelVersion: line.item.levelVersion,
    })),
  );
  const paymentsJson = JSON.stringify(
    payments.map((payment, index) => ({
      method: payment.method,
      tenderedMinor: paymentValues[index] ?? 0,
    })),
  );
  const pageCount = Math.max(
    1,
    Math.ceil(workspace.catalog.total / workspace.catalog.pageSize),
  );

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.85fr)]">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Catalog</CardTitle>
          <CardDescription>
            Search the active catalog for{" "}
            {workspace.store?.name ?? "this store"}.
          </CardDescription>
        </CardHeader>
        <div className="space-y-4 border-b px-4 pb-4 sm:px-6">
          <div className="bg-muted/35 rounded-xl border p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <span className="bg-card text-primary flex size-9 shrink-0 items-center justify-center rounded-lg border">
                <Barcode className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Scan product</p>
                <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                  Scan a barcode or enter an exact SKU. Keyboard scanners that
                  send Enter add the item automatically.
                </p>
              </div>
            </div>
            <form
              className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row"
              onSubmit={scanItem}
            >
              <Input
                ref={scannerInputRef}
                value={scanCode}
                onChange={(event) => setScanCode(event.target.value)}
                placeholder="Scan barcode or enter SKU"
                aria-label="Scan barcode or SKU"
                autoComplete="off"
                autoFocus={!disabled}
                disabled={disabled || scanning}
                className="font-mono"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={disabled || scanning || !scanCode.trim()}
              >
                <Barcode /> {scanning ? "Scanning…" : "Add scanned item"}
              </Button>
            </form>
            {disabled && (
              <p className="text-muted-foreground mt-2 text-xs">
                Barcode checkout is disabled in the public demo.
              </p>
            )}
          </div>
          <form
            className="relative"
            onSubmit={(event) => {
              event.preventDefault();
              navigateCatalog({ q: search.trim() });
            }}
          >
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
              placeholder="Search product or SKU"
              aria-label="Search sale catalog"
            />
          </form>
        </div>
        {workspace.catalog.items.length === 0 ? (
          <CardContent className="text-muted-foreground flex min-h-72 flex-col items-center justify-center text-center">
            <PackageOpen className="size-8" />
            <p className="mt-4 font-medium">No sellable items found</p>
            <p className="mt-1 text-sm">
              Try another search or activate a product for this store.
            </p>
          </CardContent>
        ) : (
          <CardContent className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 2xl:grid-cols-3">
            {workspace.catalog.items.map((item) => (
              <ProductTile
                key={item.variantId}
                item={item}
                inCart={cart.some(
                  (line) => line.item.variantId === item.variantId,
                )}
                add={() => addItem(item)}
                currency={workspace.currency}
                locale={workspace.locale}
              />
            ))}
          </CardContent>
        )}
        <CardFooter className="flex-col items-stretch sm:flex-row sm:items-center">
          <p className="text-muted-foreground text-xs">
            Showing {workspace.catalog.items.length} of{" "}
            {workspace.catalog.total} SKUs
          </p>
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-muted-foreground mr-auto text-xs sm:mr-0">
              Page {Math.min(query.page, pageCount)} of {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              disabled={query.page <= 1}
              onClick={() => navigateCatalog({ page: query.page - 1 })}
              aria-label="Previous catalog page"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              disabled={query.page >= pageCount}
              onClick={() => navigateCatalog({ page: query.page + 1 })}
              aria-label="Next catalog page"
            >
              <ChevronRight />
            </Button>
          </div>
        </CardFooter>
      </Card>

      <form action={action} className="min-w-0">
        <input type="hidden" name="storeId" value={workspace.store?.id ?? ""} />
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="linesJson" value={linesJson} />
        <input type="hidden" name="paymentsJson" value={paymentsJson} />
        <input type="hidden" name="idempotencyKey" value={requestKey} />
        <Card className="min-w-0 xl:sticky xl:top-[92px]">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="size-4" /> Current sale
                </CardTitle>
                <CardDescription>
                  {cart.length} line{cart.length === 1 ? "" : "s"} ·{" "}
                  {cart.reduce((sum, line) => sum + line.quantity, 0)} units
                </CardDescription>
              </div>
              {cart.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCart([])}
                >
                  Clear
                </Button>
              )}
            </div>
          </CardHeader>
          {cart.length === 0 ? (
            <CardContent className="text-muted-foreground flex min-h-48 flex-col items-center justify-center text-center">
              <ShoppingCart className="size-7" />
              <p className="mt-3 text-sm font-medium">Your cart is empty</p>
              <p className="mt-1 text-xs">
                Add an item from the catalog to begin.
              </p>
            </CardContent>
          ) : (
            <div className="divide-y">
              {cart.map((line) => {
                const lineSummary = lineTotals(line);
                const maximum = line.item.inventoryTracking
                  ? Math.max(1, line.item.quantity ?? 0)
                  : 1_000_000;
                return (
                  <div
                    key={line.item.variantId}
                    className="min-w-0 p-4 sm:px-6"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {line.item.productName}
                        </p>
                        <p className="text-muted-foreground truncate font-mono text-[11px]">
                          {line.item.sku}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground size-8 shrink-0"
                        onClick={() =>
                          setCart((current) =>
                            current.filter(
                              (item) =>
                                item.item.variantId !== line.item.variantId,
                            ),
                          )
                        }
                        aria-label={`Remove ${line.item.productName}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-3 min-[390px]:grid-cols-2">
                      <div>
                        <span className="text-muted-foreground mb-1 block text-[11px] font-medium uppercase">
                          Quantity
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8"
                            disabled={line.quantity <= 1}
                            onClick={() =>
                              updateLine(line.item.variantId, {
                                quantity: line.quantity - 1,
                              })
                            }
                            aria-label={`Decrease ${line.item.productName} quantity`}
                          >
                            <Minus />
                          </Button>
                          <span className="min-w-9 text-center text-sm font-semibold tabular-nums">
                            {line.quantity}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8"
                            disabled={line.quantity >= maximum}
                            onClick={() =>
                              updateLine(line.item.variantId, {
                                quantity: line.quantity + 1,
                              })
                            }
                            aria-label={`Increase ${line.item.productName} quantity`}
                          >
                            <Plus />
                          </Button>
                        </div>
                      </div>
                      <label className="min-w-0 text-[11px] font-medium uppercase">
                        <span className="text-muted-foreground mb-1 block">
                          Discount %
                        </span>
                        <Input
                          aria-label={`${line.item.productName} discount percent`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={100}
                          step={1}
                          value={line.discountPercent}
                          onChange={(event) =>
                            updateLine(line.item.variantId, {
                              discountPercent: Math.max(
                                0,
                                Math.min(100, Number(event.target.value) || 0),
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {formatMoney(
                          line.item.priceMinor,
                          workspace.currency,
                          workspace.locale,
                        )}{" "}
                        each
                      </span>
                      <strong className="tabular-nums">
                        {formatMoney(
                          lineSummary.totalMinor,
                          workspace.currency,
                          workspace.locale,
                        )}
                      </strong>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-4 border-t p-4 sm:p-6">
            <label className="block space-y-1.5 text-sm font-medium">
              Customer <span className="text-muted-foreground">(optional)</span>
              <SelectField
                ariaLabel="Sale customer"
                value={customerId || "walk-in"}
                onValueChange={(value) =>
                  setCustomerId(value === "walk-in" ? "" : value)
                }
                disabled={workspace.customers.length === 0}
                options={[
                  { value: "walk-in", label: "Walk-in customer" },
                  ...workspace.customers.map((customer) => ({
                    value: customer.id,
                    label: `${customer.name} · ${customer.code}`,
                  })),
                ]}
              />
            </label>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Payments</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={payments.length >= 6}
                  onClick={() => {
                    const method = paymentMethods.find(
                      (candidate) =>
                        !payments.some(
                          (payment) => payment.method === candidate,
                        ),
                    );
                    if (!method) return;
                    setPayments((current) => [
                      ...current,
                      {
                        key: `payment-${crypto.randomUUID()}`,
                        method,
                        amount: "",
                      },
                    ]);
                  }}
                >
                  <Plus /> Split payment
                </Button>
              </div>
              {payments.map((payment, index) => (
                <div
                  key={payment.key}
                  className="grid min-w-0 gap-2 min-[390px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <SelectField
                    ariaLabel={`Payment method ${index + 1}`}
                    value={payment.method}
                    onValueChange={(value) =>
                      setPayments((current) =>
                        current.map((item) =>
                          item.key === payment.key
                            ? {
                                ...item,
                                method: value as SalePaymentMethod,
                              }
                            : item,
                        ),
                      )
                    }
                    options={paymentMethods.map((method) => ({
                      value: method,
                      label: salePaymentLabels[method],
                      disabled: payments.some(
                        (other) =>
                          other.key !== payment.key && other.method === method,
                      ),
                    }))}
                  />
                  <Input
                    value={payment.amount}
                    onChange={(event) =>
                      setPayments((current) =>
                        current.map((item) =>
                          item.key === payment.key
                            ? { ...item, amount: event.target.value }
                            : item,
                        ),
                      )
                    }
                    required
                    inputMode="decimal"
                    pattern="\d{1,10}(\.\d{1,2})?"
                    placeholder="0.00"
                    aria-label={`Payment amount ${index + 1}`}
                  />
                  {payments.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setPayments((current) =>
                          current.filter((item) => item.key !== payment.key),
                        )
                      }
                      aria-label={`Remove payment ${index + 1}`}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setPayments((current) => {
                    const priorTenderedMinor = current
                      .slice(0, -1)
                      .reduce(
                        (sum, payment) =>
                          sum + (parseMinor(payment.amount) ?? 0),
                        0,
                      );
                    const remainingMinor = Math.max(
                      0,
                      totals.totalMinor - priorTenderedMinor,
                    );
                    return current.map((payment, index) =>
                      index === current.length - 1
                        ? {
                            ...payment,
                            amount: (remainingMinor / 100).toFixed(2),
                          }
                        : payment,
                    );
                  })
                }
                disabled={cart.length === 0}
              >
                Fill remaining total
              </Button>
            </div>

            <label className="block space-y-1.5 text-sm font-medium">
              Sale note{" "}
              <span className="text-muted-foreground">(optional)</span>
              <Textarea
                name="note"
                maxLength={500}
                rows={2}
                placeholder="Internal checkout note"
              />
            </label>

            <div className="bg-muted/35 flex items-start gap-3 rounded-xl border p-3">
              <Checkbox
                id="print-after-sale"
                checked={printAfterSale}
                onCheckedChange={(checked) =>
                  setPrintAfterSale(checked === true)
                }
              />
              <label
                htmlFor="print-after-sale"
                className="min-w-0 cursor-pointer text-sm"
              >
                <span className="flex items-center gap-2 font-medium">
                  <Printer className="size-4" /> Print bill after completion
                </span>
                <span className="text-muted-foreground mt-0.5 block text-xs leading-5">
                  Opens the browser print dialog after the receipt is issued.
                </span>
              </label>
            </div>

            <div className="space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">
                  {formatMoney(
                    totals.subtotalMinor,
                    workspace.currency,
                    workspace.locale,
                  )}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Discounts</span>
                <span className="tabular-nums">
                  −
                  {formatMoney(
                    totals.discountMinor,
                    workspace.currency,
                    workspace.locale,
                  )}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Estimated tax</span>
                <span className="tabular-nums">
                  {formatMoney(
                    totals.taxMinor,
                    workspace.currency,
                    workspace.locale,
                  )}
                </span>
              </div>
              <div className="flex justify-between gap-4 pt-1 text-base font-semibold">
                <span>Estimated total</span>
                <span className="tabular-nums">
                  {formatMoney(
                    totals.totalMinor,
                    workspace.currency,
                    workspace.locale,
                  )}
                </span>
              </div>
              <p className="text-muted-foreground text-[11px] leading-5">
                Prices, discounts, tax, stock, and change are recalculated on
                the server when the sale completes.
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
                <RefreshCw /> Reload stock
              </Button>
            )}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={
                disabled ||
                pending ||
                cart.length === 0 ||
                !paymentsValid ||
                !requestKey ||
                !workspace.store
              }
            >
              <ShoppingCart />
              {pending ? "Completing sale…" : "Complete sale"}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
