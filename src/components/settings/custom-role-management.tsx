"use client";

import { Archive, Loader2, Pencil, Plus, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  archiveCustomRoleAction,
  assignCustomRolesAction,
  createCustomRoleAction,
  roleInitialState,
  updateCustomRoleAction,
} from "@/app/app/[tenantSlug]/settings/roles/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { memberRoleLabel } from "@/modules/members/roles";
import {
  customizablePermissions,
  type CustomRoleItem,
  type CustomRoleWorkspace,
} from "@/modules/roles/schemas";

const permissionGroups = Object.entries(
  Object.groupBy(
    customizablePermissions,
    (permission) => permission.split(":")[0] ?? "other",
  ),
);

function ActionMessage({ state }: { state: typeof roleInitialState }) {
  if (!state.message) return null;
  return (
    <p
      role={
        state.status === "error" || state.status === "conflict"
          ? "alert"
          : "status"
      }
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

function RoleFields({ role }: { role?: CustomRoleItem }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium">
          Role name
          <Input
            name="name"
            required
            minLength={2}
            maxLength={80}
            defaultValue={role?.name}
          />
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          Description
          <Input
            name="description"
            maxLength={240}
            defaultValue={role?.description}
          />
        </label>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Permissions</legend>
        <p className="text-muted-foreground text-xs">
          Sensitive owner, billing, membership, and settings capabilities cannot
          be added to custom roles.
        </p>
        <div className="grid max-h-[44vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {permissionGroups.map(([resource, permissions]) => (
            <div key={resource} className="rounded-xl border p-3">
              <p className="mb-2 text-xs font-semibold tracking-wider uppercase">
                {resource}
              </p>
              <div className="space-y-2">
                {permissions?.map((permission) => (
                  <label
                    key={permission}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      name="permissions"
                      value={permission}
                      defaultChecked={role?.permissions.includes(permission)}
                    />
                    {permission.split(":")[1]?.replaceAll(/([A-Z])/g, " $1")}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
    </>
  );
}

function RoleDialog({
  tenantSlug,
  role,
  disabled,
}: {
  tenantSlug: string;
  role?: CustomRoleItem;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const bound = role
    ? updateCustomRoleAction.bind(null, tenantSlug, role.id)
    : createCustomRoleAction.bind(null, tenantSlug);
  const [state, action, pending] = React.useActionState(
    bound,
    roleInitialState,
  );
  React.useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
    router.refresh();
    const timer = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [router, state]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size={role ? "sm" : "default"}
          variant={role ? "outline" : "default"}
          disabled={disabled}
        >
          {role ? <Pencil /> : <Plus />}
          {role ? "Edit" : "New custom role"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogTitle className="text-lg font-semibold">
          {role ? `Edit ${role.name}` : "Create custom role"}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Custom permissions are added to the member’s fixed base role and
          remain tenant scoped.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-5">
          {role && (
            <input type="hidden" name="expectedVersion" value={role.version} />
          )}
          <RoleFields role={role} />
          <ActionMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {role ? "Save role" : "Create role"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MemberAssignment({
  tenantSlug,
  member,
  roles,
  disabled,
}: {
  tenantSlug: string;
  member: CustomRoleWorkspace["members"][number];
  roles: CustomRoleItem[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    assignCustomRolesAction.bind(null, tenantSlug, member.id),
    roleInitialState,
  );
  React.useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      router.refresh();
    }
  }, [router, state]);
  const owner = member.baseRole.split(",").includes("owner");
  return (
    <form
      action={action}
      className="grid gap-4 border-t px-5 py-4 first:border-t-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] lg:items-center"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{member.name}</p>
        <p className="text-muted-foreground truncate text-xs">
          {member.email} ·{" "}
          {memberRoleLabel(member.baseRole.split(",")[0] ?? member.baseRole)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {roles.length === 0 ? (
          <span className="text-muted-foreground text-xs">
            Create a role first.
          </span>
        ) : (
          roles.map((role) => (
            <label
              key={role.id}
              className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs"
            >
              <Checkbox
                name="roleIds"
                value={role.id}
                defaultChecked={member.customRoleIds.includes(role.id)}
                disabled={disabled || owner}
              />
              {role.name}
            </label>
          ))
        )}
      </div>
      <div className="flex flex-col items-end gap-2">
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={disabled || owner || pending || roles.length === 0}
        >
          {pending ? "Saving…" : "Save assignments"}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function CustomRoleManagement({
  tenantSlug,
  workspace,
  canManage,
  isDemo,
}: {
  tenantSlug: string;
  workspace: CustomRoleWorkspace;
  canManage: boolean;
  isDemo: boolean;
}) {
  const router = useRouter();
  const disabled = isDemo || !canManage || !workspace.enabled;
  return (
    <div className="space-y-6">
      {!workspace.enabled && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
            <span className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl">
              <ShieldCheck className="size-5" />
            </span>
            <div className="flex-1">
              <p className="font-semibold">Custom roles require Business</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Your {workspace.planName} plan continues to use the secure fixed
                role catalog.
              </p>
            </div>
            <Button asChild>
              <a href={`/app/${tenantSlug}/settings/billing`}>Compare plans</a>
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="flex justify-end">
        <RoleDialog tenantSlug={tenantSlug} disabled={disabled} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {workspace.roles.map((role) => (
          <Card key={role.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{role.name}</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  {role.description || "No description"}
                </p>
              </div>
              <Badge variant="secondary">{role.assignedMembers} assigned</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {role.permissions.map((permission) => (
                <Badge key={permission} variant="outline">
                  {permission}
                </Badge>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <RoleDialog
                tenantSlug={tenantSlug}
                role={role}
                disabled={disabled}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  React.startTransition(async () => {
                    const result = await archiveCustomRoleAction(
                      tenantSlug,
                      role.id,
                      role.version,
                    );
                    if (result.status === "success")
                      toast.success(result.message);
                    else toast.error(result.message);
                    router.refresh();
                  });
                }}
              >
                <Archive /> Archive
              </Button>
            </div>
          </Card>
        ))}
        {workspace.enabled && workspace.roles.length === 0 && (
          <Card className="p-8 text-center lg:col-span-2">
            <ShieldCheck className="text-muted-foreground mx-auto size-8" />
            <p className="mt-3 font-semibold">No custom roles yet</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Create a least-privilege role for a specific operational
              responsibility.
            </p>
          </Card>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Member assignments</CardTitle>
          <CardDescription>
            Custom permissions supplement—not replace—the fixed role shown for
            each member.
          </CardDescription>
        </CardHeader>
        <div>
          {workspace.members.map((member) => (
            <MemberAssignment
              key={member.id}
              tenantSlug={tenantSlug}
              member={member}
              roles={workspace.roles}
              disabled={disabled}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
