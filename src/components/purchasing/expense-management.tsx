"use client";

import { Check, ExternalLink, ImageUp, Plus, Receipt, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  createExpenseAction,
  decideExpenseAction,
} from "@/app/app/[tenantSlug]/suppliers/actions";
import {
  PurchasingActionMessage,
  purchasingInitialState,
  purchasingSelectClass,
} from "@/components/purchasing/action-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import type {
  ExpenseListItem,
  PurchasingReferenceData,
} from "@/modules/purchasing/schemas";

const defaultCategories = [
  "Utilities",
  "Rent",
  "Maintenance",
  "Transport",
  "Marketing",
  "Office supplies",
  "Professional services",
  "Other",
];

export function NewExpenseDialog({
  tenantSlug,
  reference,
  disabled,
}: {
  tenantSlug: string;
  reference: PurchasingReferenceData;
  disabled: boolean;
}) {
  const categories = React.useMemo(
    () =>
      [
        ...new Set([
          ...reference.expenseCategories.map((category) => category.name),
          ...defaultCategories,
        ]),
      ].sort((left, right) => left.localeCompare(right)),
    [reference.expenseCategories],
  );
  const [open, setOpen] = React.useState(false);
  const [idempotencyKey, setIdempotencyKey] = React.useState(() =>
    crypto.randomUUID(),
  );
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    createExpenseAction.bind(null, tenantSlug),
    purchasingInitialState,
  );
  React.useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
    router.refresh();
    const timeout = window.setTimeout(() => {
      setIdempotencyKey(crypto.randomUUID());
      setOpen(false);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [router, state]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus /> New expense
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogTitle className="text-lg font-semibold">
          Submit expense
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Submitted expenses require approval before they enter operational
          reporting.
        </DialogDescription>
        <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <label className="space-y-1.5 text-sm font-medium">
            Store
            <select name="storeId" className={purchasingSelectClass}>
              {reference.stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Category
            <Input
              name="category"
              list="expense-category-options"
              required
              minLength={2}
              maxLength={80}
              placeholder="Utilities"
            />
            <datalist id="expense-category-options">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Vendor
            <Input name="vendor" required minLength={2} maxLength={140} />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Expense date
            <Input
              name="expenseDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
            Amount ({reference.currency})
            <Input
              name="amount"
              inputMode="decimal"
              required
              placeholder="0.00"
            />
          </label>
          <input type="hidden" name="receiptUrl" value="" />
          <p className="bg-muted/55 text-muted-foreground rounded-lg border p-3 text-xs sm:col-span-2">
            Submit the expense first, then attach its receipt image securely
            through the configured Cloudinary account.
          </p>
          <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
            Notes
            <textarea
              name="notes"
              maxLength={1000}
              rows={3}
              className="border-input bg-card focus-visible:ring-ring w-full rounded-lg border p-3 text-sm outline-none focus-visible:ring-2"
            />
          </label>
          <div className="sm:col-span-2">
            <PurchasingActionMessage state={state} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Submitting…" : "Submit expense"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseReceiptUpload({
  tenantSlug,
  expense,
}: {
  tenantSlug: string;
  expense: ExpenseListItem;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  async function upload(formData: FormData) {
    setPending(true);
    try {
      formData.set("expectedVersion", String(expense.version));
      const response = await fetch(
        `/api/app/${tenantSlug}/expenses/${expense.id}/receipt`,
        { method: "POST", body: formData },
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(payload.message ?? "Receipt upload failed.");
      toast.success(payload.message ?? "Receipt image attached.");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Receipt upload failed.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ImageUp /> Attach receipt
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Attach receipt to {expense.expenseNumber}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Upload a JPEG, PNG, WebP, or AVIF image up to 10 MB. Storage ownership
          and metadata are enforced on the server.
        </DialogDescription>
        <form action={upload} className="mt-5 space-y-4">
          <label className="space-y-1.5 text-sm font-medium">
            Receipt image
            <Input
              name="receipt"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              required
            />
          </label>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Uploading…" : "Upload receipt"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Decide({
  tenantSlug,
  expense,
  decision,
}: {
  tenantSlug: string;
  expense: ExpenseListItem;
  decision: "approved" | "rejected";
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    decideExpenseAction.bind(null, tenantSlug, expense.id, decision),
    purchasingInitialState,
  );
  React.useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
    router.refresh();
    const timeout = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [router, state]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant={decision === "approved" ? "outline" : "ghost"}
        >
          {decision === "approved" ? <Check /> : <X />}
          {decision === "approved" ? "Approve" : "Reject"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          {decision === "approved" ? "Approve" : "Reject"}{" "}
          {expense.expenseNumber}?
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          {expense.vendor} ·{" "}
          {formatMoney({
            amountMinor: expense.amountMinor,
            currency: expense.currency,
          })}
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <input type="hidden" name="expectedVersion" value={expense.version} />
          <label className="space-y-1.5 text-sm font-medium">
            Decision note
            <textarea
              name="note"
              maxLength={500}
              rows={3}
              className="border-input bg-card w-full rounded-lg border p-3 text-sm"
            />
          </label>
          <PurchasingActionMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={decision === "rejected" ? "destructive" : "default"}
              disabled={pending}
            >
              {pending
                ? "Saving…"
                : decision === "approved"
                  ? "Approve"
                  : "Reject"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExpenseManagement({
  tenantSlug,
  items,
  canApprove,
  canUpload,
  isDemo,
}: {
  tenantSlug: string;
  items: ExpenseListItem[];
  canApprove: boolean;
  canUpload: boolean;
  isDemo: boolean;
}) {
  if (items.length === 0)
    return (
      <div className="p-10 text-center">
        <Receipt className="text-muted-foreground mx-auto size-7" />
        <p className="mt-3 font-medium">No expenses match this view</p>
      </div>
    );
  return (
    <div className="divide-y">
      {items.map((expense) => (
        <article
          key={expense.id}
          className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{expense.vendor}</h2>
              <Badge
                variant={
                  expense.status === "approved"
                    ? "success"
                    : expense.status === "submitted"
                      ? "warning"
                      : "secondary"
                }
              >
                {expense.status}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {expense.expenseNumber}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {expense.category} · {expense.storeName} · {expense.expenseDate}
            </p>
            <p className="mt-2 text-lg font-semibold">
              {formatMoney({
                amountMinor: expense.amountMinor,
                currency: expense.currency,
              })}
            </p>
            {expense.notes && (
              <p className="text-muted-foreground mt-1 text-xs">
                {expense.notes}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {expense.receiptUrl && (
              <Button asChild size="sm" variant="outline">
                <a href={expense.receiptUrl} target="_blank" rel="noreferrer">
                  <ExternalLink /> Receipt
                </a>
              </Button>
            )}
            {!expense.receiptUrl && canUpload && !isDemo && (
              <ExpenseReceiptUpload tenantSlug={tenantSlug} expense={expense} />
            )}
            {expense.status === "submitted" && canApprove && !isDemo && (
              <>
                <Decide
                  tenantSlug={tenantSlug}
                  expense={expense}
                  decision="approved"
                />
                <Decide
                  tenantSlug={tenantSlug}
                  expense={expense}
                  decision="rejected"
                />
              </>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
