import { Clock3, Mail, ShieldCheck, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  CancelInvitationButton,
  InviteMemberDialog,
  MemberAccessDialog,
  StoreAccessBadges,
} from "@/components/members/member-management";
import { PageHeader } from "@/components/shared/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getTenantMemberManagementData } from "@/modules/members/member-service";
import { memberRoleLabel } from "@/modules/members/roles";
import { hasPermission } from "@/modules/permissions/permissions";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Team settings" };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default async function MembersPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const context = await requireTenantContext(tenantSlug).catch(() =>
    notFound(),
  );
  if (!hasPermission(context.permissions, "member:read")) notFound();
  const canInvite = hasPermission(context.permissions, "member:invite");
  const canUpdate = hasPermission(context.permissions, "member:updateRole");
  const canRemove = hasPermission(context.permissions, "member:remove");
  const data = await getTenantMemberManagementData(context, await headers());
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Team access"
        description="Manage business roles and the stores each person can access."
        actions={
          canInvite ? (
            <InviteMemberDialog tenantSlug={tenantSlug} stores={data.stores} />
          ) : undefined
        }
      />
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Team summary">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
              <UsersRound className="size-5" />
            </span>
            <div>
              <p className="text-muted-foreground text-xs">Members</p>
              <p className="text-xl font-semibold">{data.members.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="bg-warning/20 text-warning-foreground flex size-10 items-center justify-center rounded-lg">
              <Clock3 className="size-5" />
            </span>
            <div>
              <p className="text-muted-foreground text-xs">Pending</p>
              <p className="text-xl font-semibold">{data.invitations.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="bg-success/20 text-success-foreground flex size-10 items-center justify-center rounded-lg">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <p className="text-muted-foreground text-xs">Plan capacity</p>
              <p className="text-xl font-semibold">
                {data.members.length + data.invitations.length}
                {data.memberLimit ? ` / ${data.memberLimit}` : " / Flexible"}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Roles control capabilities; store assignments control location
            scope.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {data.members.map((member) => (
              <div
                key={member.id}
                className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,1fr)_auto] sm:items-center sm:px-6"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar>
                    <AvatarFallback>{initials(member.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.name}
                      {member.isCurrentUser && (
                        <span className="text-muted-foreground ml-1 text-xs">
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {member.email}
                    </p>
                  </div>
                </div>
                <div>
                  <Badge
                    variant={
                      member.role.includes("owner") ? "success" : "secondary"
                    }
                  >
                    {memberRoleLabel(member.role.split(",")[0] ?? member.role)}
                  </Badge>
                </div>
                <StoreAccessBadges
                  stores={data.stores}
                  storeIds={member.storeIds}
                />
                <div className="justify-self-start sm:justify-self-end">
                  <MemberAccessDialog
                    tenantSlug={tenantSlug}
                    member={member}
                    stores={data.stores}
                    canUpdate={canUpdate}
                    canRemove={canRemove}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
          <CardDescription>
            Invitations expire automatically after 48 hours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.invitations.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center py-8 text-center text-sm">
              <Mail className="mb-3 size-7" />
              No pending invitations.
            </div>
          ) : (
            <div className="divide-y">
              {data.invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {invitation.email}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {memberRoleLabel(invitation.role)} · expires{" "}
                      {new Intl.DateTimeFormat("en", {
                        dateStyle: "medium",
                      }).format(new Date(invitation.expiresAt))}
                    </p>
                  </div>
                  <StoreAccessBadges
                    stores={data.stores}
                    storeIds={invitation.storeIds}
                  />
                  {canInvite && (
                    <CancelInvitationButton
                      tenantSlug={tenantSlug}
                      invitation={invitation}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
