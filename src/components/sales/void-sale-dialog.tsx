"use client";

import { Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  voidSaleAction,
  type VoidSaleActionState,
} from "@/app/app/[tenantSlug]/sales/[saleId]/actions";
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
import { Textarea } from "@/components/ui/textarea";

const initialState: VoidSaleActionState = { status: "idle", message: "" };

export function VoidSaleDialog({
  tenantSlug,
  saleId,
  receiptNumber,
}: {
  tenantSlug: string;
  saleId: string;
  receiptNumber: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = React.useActionState(
    voidSaleAction.bind(null, tenantSlug, saleId),
    initialState,
  );
  const router = useRouter();
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
        <Button variant="destructive">
          <Ban /> Void sale
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Void receipt {receiptNumber}?
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm leading-6">
          This excludes the sale from reporting, marks its recorded tenders and
          receipt as voided, and restores all tracked inventory. Sales with a
          processed return cannot be voided.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <label className="block space-y-2 text-sm font-medium">
            Reason
            <Textarea
              name="reason"
              required
              minLength={3}
              maxLength={500}
              placeholder="Why is this sale being voided?"
            />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            Enter {receiptNumber} to confirm
            <Input
              name="confirmationReceiptNumber"
              required
              autoComplete="off"
              placeholder={receiptNumber}
            />
          </label>
          {state.message && (
            <p
              role={state.status === "error" ? "alert" : "status"}
              className={
                state.status === "error"
                  ? "bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
                  : "bg-success/15 text-success-foreground rounded-lg p-3 text-sm"
              }
            >
              {state.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Voiding…" : "Void sale"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
