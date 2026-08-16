"use client";

import { MailPlus, Settings2, Store, Trash2, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  cancelInvitationAction,
  inviteMemberAction,
  type MemberActionState,
  removeMemberAction,
  updateMemberAction,
} from "@/app/app/[tenantSlug]/settings/members/actions";
import { Badge } from "@/components/ui/badge";
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
import type {
  MemberStoreOption,
  TenantInvitationListItem,
  TenantMemberListItem,
} from "@/modules/members/member-service";
import {
  assignableMemberRoles,
  memberRoleLabel,
} from "@/modules/members/roles";

const initialMemberActionState: MemberActionState = {
  status: "idle",
  message: "",
};

function RoleSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <select
      name="role"
      defaultValue={defaultValue}
      className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/30 h-10 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2"
      aria-label="Role"
    >
      {assignableMemberRoles.map((role) => (
        <option key={role} value={role}>
          {memberRoleLabel(role)}
        </option>
      ))}
    </select>
  );
}

function StoreChoices({
  stores,
  selectedStoreIds,
}: {
  stores: MemberStoreOption[];
  selectedStoreIds: readonly string[];
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Store access</legend>
      <p className="text-muted-foreground text-xs">
        Choose the locations this person can access.
      </p>
      <div className="grid gap-2 pt-1 sm:grid-cols-2">
        {stores.map((store) => (
          <label
            key={store.id}
            className="hover:bg-muted/40 flex cursor-pointer items-center gap-3 rounded-lg border p-3"
          >
            <Checkbox
              name="storeIds"
              value={store.id}
              defaultChecked={selectedStoreIds.includes(store.id)}
              aria-label={`Grant access to ${store.name}`}
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {store.name}
              </span>
              <span className="text-muted-foreground block text-xs">
                {store.code}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ActionMessage({
  status,
  message,
}: {
  status: "idle" | "error" | "success";
  message: string;
}) {
  if (!message) return null;
  return (
    <p
      role={status === "error" ? "alert" : "status"}
      className={
        status === "error"
          ? "bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
          : "bg-success/15 text-success-foreground rounded-lg p-3 text-sm"
      }
    >
      {message}
    </p>
  );
}

export function InviteMemberDialog({
  tenantSlug,
  stores,
}: {
  tenantSlug: string;
  stores: MemberStoreOption[];
}) {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = React.useActionState(
    inviteMemberAction.bind(null, tenantSlug),
    initialMemberActionState,
  );
  const router = useRouter();
  React.useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
    router.refresh();
  }, [router, state]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={stores.length === 0}>
          <MailPlus /> Invite member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Invite a team member
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          The invitation expires after 48 hours. Access begins only after the
          invited email is verified and accepted.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-5">
          <div className="space-y-2">
            <label htmlFor="invite-email" className="text-sm font-medium">
              Work email
            </label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="teammate@company.com"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="invite-role" className="text-sm font-medium">
              Role
            </label>
            <div id="invite-role">
              <RoleSelect defaultValue="employee" />
            </div>
          </div>
          <StoreChoices stores={stores} selectedStoreIds={[]} />
          <ActionMessage status={state.status} message={state.message} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send invitation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MemberAccessDialog({
  tenantSlug,
  member,
  stores,
  canUpdate,
  canRemove,
}: {
  tenantSlug: string;
  member: TenantMemberListItem;
  stores: MemberStoreOption[];
  canUpdate: boolean;
  canRemove: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const [removing, startRemoving] = React.useTransition();
  const [state, action, pending] = React.useActionState(
    updateMemberAction.bind(null, tenantSlug),
    initialMemberActionState,
  );
  const router = useRouter();
  React.useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
    router.refresh();
  }, [router, state]);

  function removeMember() {
    startRemoving(async () => {
      const result = await removeMemberAction(tenantSlug, member.id);
      if (result.status === "success") {
        toast.success(result.message);
        setConfirmRemove(false);
        setOpen(false);
        router.refresh();
      } else toast.error(result.message);
    });
  }

  if (member.role.split(",").includes("owner") || (!canUpdate && !canRemove))
    return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Manage ${member.name}`}
        >
          <Settings2 /> Manage
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Manage {member.name}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Update this member’s role and explicit store assignments.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-5">
          <input type="hidden" name="memberId" value={member.id} />
          <div className="space-y-2">
            <label className="text-sm font-medium">Role</label>
            <RoleSelect defaultValue={member.role.split(",")[0] ?? "viewer"} />
          </div>
          <StoreChoices stores={stores} selectedStoreIds={member.storeIds} />
          <ActionMessage status={state.status} message={state.message} />
          <div className="flex flex-wrap justify-between gap-2">
            {canRemove && !member.isCurrentUser ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmRemove(true)}
              >
                <UserMinus /> Remove member
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              {canUpdate && (
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Save access"}
                </Button>
              )}
            </div>
          </div>
        </form>
        {confirmRemove && (
          <div className="bg-destructive/8 mt-4 rounded-lg border p-4">
            <p className="font-medium">Remove {member.name}?</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Their business membership and all store access will be revoked.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmRemove(false)}
              >
                Keep member
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={removeMember}
                disabled={removing}
              >
                {removing ? "Removing…" : "Confirm removal"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CancelInvitationButton({
  tenantSlug,
  invitation,
}: {
  tenantSlug: string;
  invitation: TenantInvitationListItem;
}) {
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await cancelInvitationAction(
            tenantSlug,
            invitation.id,
          );
          if (result.status === "success") {
            toast.success(result.message);
            router.refresh();
          } else toast.error(result.message);
        })
      }
      aria-label={`Cancel invitation for ${invitation.email}`}
    >
      <Trash2 /> {pending ? "Cancelling…" : "Cancel"}
    </Button>
  );
}

export function StoreAccessBadges({
  stores,
  storeIds,
}: {
  stores: MemberStoreOption[];
  storeIds: readonly string[];
}) {
  const selected = stores.filter((store) => storeIds.includes(store.id));
  if (selected.length === 0)
    return <span className="text-muted-foreground text-xs">No stores</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {selected.map((store) => (
        <Badge key={store.id} variant="secondary">
          <Store className="size-3" /> {store.name}
        </Badge>
      ))}
    </div>
  );
}
