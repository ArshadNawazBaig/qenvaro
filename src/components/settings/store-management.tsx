"use client";

import { Archive, MapPin, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  archiveStoreAction,
  createStoreAction,
  updateStoreAction,
} from "@/app/app/[tenantSlug]/settings/business/actions";
import {
  SettingsActionMessage,
  settingsInitialState,
} from "@/components/settings/action-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { StoreSettingsItem } from "@/modules/settings/schemas";

function StoreFields({
  store,
  defaultTimezone,
}: {
  store?: StoreSettingsItem;
  defaultTimezone: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm font-medium">
        Store name
        <Input
          name="name"
          required
          minLength={2}
          maxLength={120}
          defaultValue={store?.name}
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Code
        <Input
          name="code"
          required
          minLength={2}
          maxLength={12}
          defaultValue={store?.code}
          className="uppercase"
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
        Timezone
        <Input
          name="timezone"
          required
          defaultValue={store?.timezone ?? defaultTimezone}
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
        Address
        <textarea
          name="address"
          maxLength={500}
          rows={3}
          defaultValue={store?.address}
          className="border-input bg-card w-full rounded-lg border p-3 text-sm"
        />
      </label>
    </div>
  );
}

export function NewStoreDialog({
  tenantSlug,
  defaultTimezone,
  disabled,
}: {
  tenantSlug: string;
  defaultTimezone: string;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    createStoreAction.bind(null, tenantSlug),
    settingsInitialState,
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
        <Button disabled={disabled}>
          <Plus /> New store
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Create store
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Your subscription store limit is enforced atomically on the server.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <StoreFields defaultTimezone={defaultTimezone} />
          <SettingsActionMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create store"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StoreActions({
  tenantSlug,
  store,
  defaultTimezone,
  canManage,
  isDemo,
}: {
  tenantSlug: string;
  store: StoreSettingsItem;
  defaultTimezone: string;
  canManage: boolean;
  isDemo: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [editState, editAction, editPending] = React.useActionState(
    updateStoreAction.bind(null, tenantSlug, store.id),
    settingsInitialState,
  );
  const [archiveState, archiveAction, archivePending] = React.useActionState(
    archiveStoreAction.bind(null, tenantSlug, store.id),
    settingsInitialState,
  );
  React.useEffect(() => {
    for (const [state, close] of [
      [editState, setEditOpen],
      [archiveState, setArchiveOpen],
    ] as const)
      if (state.status === "success") {
        toast.success(state.message);
        router.refresh();
        const timeout = window.setTimeout(() => close(false), 0);
        return () => window.clearTimeout(timeout);
      }
  }, [archiveState, editState, router]);
  const disabled = isDemo || !canManage || store.status === "archived";
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={disabled}>
            <Pencil /> Edit
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            Edit {store.name}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            Store identity changes do not rewrite historical transaction
            snapshots.
          </DialogDescription>
          <form action={editAction} className="mt-5 space-y-4">
            <input type="hidden" name="expectedVersion" value={store.version} />
            <StoreFields store={store} defaultTimezone={defaultTimezone} />
            <SettingsActionMessage state={editState} />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={editPending}>
                {editPending ? "Saving…" : "Save store"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={disabled}>
            <Archive /> Archive
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            Archive {store.name}?
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            The last active store, stores with non-zero stock, and stores with
            open purchases cannot be archived.
          </DialogDescription>
          <form action={archiveAction} className="mt-5 space-y-4">
            <input type="hidden" name="expectedVersion" value={store.version} />
            <SettingsActionMessage state={archiveState} />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="destructive"
                disabled={archivePending}
              >
                {archivePending ? "Archiving…" : "Archive store"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function StoreManagement({
  tenantSlug,
  stores,
  defaultTimezone,
  canManage,
  isDemo,
}: {
  tenantSlug: string;
  stores: StoreSettingsItem[];
  defaultTimezone: string;
  canManage: boolean;
  isDemo: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {stores.map((store) => (
        <Card key={store.id} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3">
              <div className="bg-muted flex size-10 items-center justify-center rounded-lg">
                <MapPin className="size-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{store.name}</h2>
                  <Badge
                    variant={
                      store.status === "active" ? "success" : "secondary"
                    }
                  >
                    {store.status}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {store.code} · {store.timezone}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {store.address || "No address set"}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-5">
            <StoreActions
              tenantSlug={tenantSlug}
              store={store}
              defaultTimezone={defaultTimezone}
              canManage={canManage}
              isDemo={isDemo}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
