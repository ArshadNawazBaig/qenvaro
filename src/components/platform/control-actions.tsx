"use client";

import {
  Archive,
  Ban,
  Flag,
  LifeBuoy,
  Loader2,
  Megaphone,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  archiveAnnouncementAction,
  banPlatformUserAction,
  createFeatureFlagAction,
  grantSupportAccessAction,
  platformInitialState,
  publishAnnouncementAction,
  reactivateTenantAction,
  revokeSupportAccessAction,
  setTenantFlagOverrideAction,
  suspendTenantAction,
  unbanPlatformUserAction,
} from "@/app/platform/(verified)/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

function Message({ state }: { state: typeof platformInitialState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.status === "success" ? "status" : "alert"}
      className={
        state.status === "success"
          ? "bg-success/15 text-success-foreground rounded-lg p-3 text-sm"
          : "bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
      }
    >
      {state.message}
    </p>
  );
}
function useClose(state: typeof platformInitialState, close: () => void) {
  const router = useRouter();
  React.useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
    router.refresh();
    const timer = window.setTimeout(close, 0);
    return () => window.clearTimeout(timer);
  }, [close, router, state]);
}

export function TenantLifecycleDialog({
  tenantId,
  version,
  suspended,
}: {
  tenantId: string;
  version: number;
  suspended: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const actionFn = suspended ? reactivateTenantAction : suspendTenantAction;
  const [state, action, pending] = React.useActionState(
    actionFn.bind(null, tenantId, version),
    platformInitialState,
  );
  const close = React.useCallback(() => setOpen(false), []);
  useClose(state, close);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={suspended ? "default" : "destructive"}>
          {suspended ? <RotateCcw /> : <Ban />}
          {suspended ? "Reactivate" : "Suspend"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          {suspended ? "Reactivate tenant" : "Suspend tenant"}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          {suspended
            ? "Restore the preserved verified billing state and normal tenant access."
            : "Immediately restrict the tenant to billing recovery and account security routes."}
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <label className="block space-y-1.5 text-sm font-medium">
            Required operational reason
            <Textarea
              name="reason"
              required
              minLength={10}
              maxLength={500}
              rows={4}
            />
          </label>
          <Message state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={suspended ? "default" : "destructive"}
              disabled={pending}
            >
              {pending && <Loader2 className="animate-spin" />}
              {suspended ? "Confirm reactivation" : "Confirm suspension"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UserLifecycleDialog({
  userId,
  banned,
  disabled,
}: {
  userId: string;
  banned: boolean;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const actionFn = banned ? unbanPlatformUserAction : banPlatformUserAction;
  const [state, action, pending] = React.useActionState(
    actionFn.bind(null, userId),
    platformInitialState,
  );
  const close = React.useCallback(() => setOpen(false), []);
  useClose(state, close);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant={banned ? "outline" : "destructive"}
          disabled={disabled}
        >
          {banned ? <RotateCcw /> : <Ban />}
          {banned ? "Reactivate" : "Suspend user"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          {banned ? "Reactivate user" : "Suspend user"}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          {banned
            ? "Allow this identity to sign in again. Existing sessions remain revoked."
            : "Deny sign-in and revoke every active session for this identity."}
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          {!banned && (
            <label className="block space-y-1.5 text-sm font-medium">
              Suspension period
              <select
                name="durationDays"
                defaultValue="30"
                className="border-input bg-card h-10 w-full rounded-lg border px-3"
              >
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">365 days</option>
              </select>
            </label>
          )}
          <label className="block space-y-1.5 text-sm font-medium">
            Required reason
            <Textarea
              name="reason"
              required
              minLength={10}
              maxLength={500}
              rows={4}
            />
          </label>
          <Message state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={banned ? "default" : "destructive"}
              disabled={pending}
            >
              {pending && <Loader2 className="animate-spin" />}
              {banned ? "Confirm reactivation" : "Confirm suspension"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GrantSupportDialog({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = React.useActionState(
    grantSupportAccessAction.bind(null, tenantId),
    platformInitialState,
  );
  const close = React.useCallback(() => setOpen(false), []);
  useClose(state, close);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <LifeBuoy /> Grant support window
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Create break-glass support grant
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Disabled by default, time-limited, reason-required, visible,
          auditable, and revocable. This control plane still exposes no tenant
          business-record viewer.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <label className="block space-y-1.5 text-sm font-medium">
            Duration
            <select
              name="durationMinutes"
              defaultValue="30"
              className="border-input bg-card h-10 w-full rounded-lg border px-3"
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">60 minutes</option>
              <option value="120">120 minutes</option>
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Required support reason
            <Textarea
              name="reason"
              required
              minLength={15}
              maxLength={500}
              rows={4}
            />
          </label>
          <Message state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}Create grant
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RevokeSupportDialog({ grantId }: { grantId: string }) {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = React.useActionState(
    revokeSupportAccessAction.bind(null, grantId),
    platformInitialState,
  );
  const close = React.useCallback(() => setOpen(false), []);
  useClose(state, close);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive">
          Revoke
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Revoke support grant
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Revocation takes effect immediately and is appended to the platform
          audit log.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <label className="block space-y-1.5 text-sm font-medium">
            Required revocation reason
            <Textarea
              name="reason"
              required
              minLength={10}
              maxLength={500}
              rows={3}
            />
          </label>
          <Message state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              Revoke now
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewFeatureFlagDialog() {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = React.useActionState(
    createFeatureFlagAction,
    platformInitialState,
  );
  const close = React.useCallback(() => setOpen(false), []);
  useClose(state, close);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New flag
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Create feature flag
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Flags are release controls. They never override plan entitlements or
          permissions.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <label className="block space-y-1.5 text-sm font-medium">
            Key
            <Input
              name="key"
              required
              pattern="[a-z][a-z0-9_]*"
              placeholder="beta_dashboard_insights"
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Description
            <Input name="description" required minLength={5} maxLength={240} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="defaultEnabled" />
            Enabled by default
          </label>
          <Message state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              <Flag /> Create flag
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TenantFlagOverrideForm({ flagId }: { flagId: string }) {
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    setTenantFlagOverrideAction.bind(null, flagId),
    platformInitialState,
  );
  React.useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      router.refresh();
    }
  }, [router, state]);
  return (
    <form
      action={action}
      className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
    >
      <Input
        name="tenantId"
        required
        placeholder="Tenant ID"
        aria-label="Tenant ID"
      />
      <select
        name="enabled"
        defaultValue="true"
        className="border-input bg-card h-10 rounded-lg border px-3 text-sm"
        aria-label="Override state"
      >
        <option value="true">Enabled</option>
        <option value="false">Disabled</option>
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Set override"}
      </Button>
      <div className="sm:col-span-3">
        <Message state={state} />
      </div>
    </form>
  );
}

export function NewAnnouncementDialog() {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = React.useActionState(
    publishAnnouncementAction,
    platformInitialState,
  );
  const close = React.useCallback(() => setOpen(false), []);
  useClose(state, close);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Megaphone /> Publish announcement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Publish platform announcement
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Published messages appear in every authenticated tenant notification
          center for a bounded period.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <label className="block space-y-1.5 text-sm font-medium">
            Title
            <Input name="title" required minLength={3} maxLength={120} />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Message
            <Textarea
              name="message"
              required
              minLength={10}
              maxLength={1000}
              rows={4}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm font-medium">
              Severity
              <select
                name="severity"
                defaultValue="info"
                className="border-input bg-card h-10 w-full rounded-lg border px-3"
              >
                <option value="info">Information</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Visible days
              <Input
                name="durationDays"
                type="number"
                min={1}
                max={90}
                defaultValue={7}
                required
              />
            </label>
          </div>
          <label className="block space-y-1.5 text-sm font-medium">
            Optional relative link
            <Input name="href" placeholder="/pricing" />
          </label>
          <Message state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              Publish now
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ArchiveAnnouncementButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await archiveAnnouncementAction(id);
          if (result.status === "success") toast.success(result.message);
          else toast.error(result.message);
          router.refresh();
        })
      }
    >
      <Archive />
      {pending ? "Archiving…" : "Archive"}
    </Button>
  );
}
