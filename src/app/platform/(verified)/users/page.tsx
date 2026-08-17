import { Search, ShieldCheck, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { UserLifecycleDialog } from "@/components/platform/control-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireVerifiedPlatformContext } from "@/server/auth/platform-context";
import { getPlatformUsers } from "@/server/repositories/platform-control";

export const metadata: Metadata = { title: "Platform users" };
export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const context = await requireVerifiedPlatformContext();
  const query = await searchParams;
  const data = await getPlatformUsers(context, query);
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Platform"
        title="Users"
        description="Global identity and security posture with membership counts; tenant-owned records are excluded."
        actions={
          <Badge variant="outline">
            {data.total.toLocaleString()} identities
          </Badge>
        }
      />
      <form className="flex max-w-lg gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={data.q}
            placeholder="Search name or email"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      {data.items.length === 0 ? (
        <Card className="p-10 text-center">
          <UsersRound className="text-muted-foreground mx-auto size-8" />
          <p className="mt-3 font-semibold">No users found</p>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.items.map((user) => (
            <Card key={user.id} className="p-5">
              <div className="flex items-start gap-3">
                <span className="bg-muted flex size-10 items-center justify-center rounded-xl">
                  <UsersRound className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{user.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {user.email}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant={user.emailVerified ? "success" : "warning"}>
                      {user.emailVerified ? "Email verified" : "Email pending"}
                    </Badge>
                    <Badge
                      variant={user.twoFactorEnabled ? "success" : "secondary"}
                    >
                      <ShieldCheck className="size-3" />
                      {user.twoFactorEnabled ? "2FA enabled" : "2FA off"}
                    </Badge>
                    <Badge variant="outline">
                      {user.memberships} businesses
                    </Badge>
                    {user.role.includes("PLATFORM_SUPER_ADMIN") && (
                      <Badge variant="destructive">Super admin</Badge>
                    )}
                    {user.banned && <Badge variant="destructive">Banned</Badge>}
                  </div>
                  <div className="mt-4">
                    <UserLifecycleDialog
                      userId={user.id}
                      banned={user.banned}
                      disabled={
                        user.id === context.userId ||
                        user.role.includes("PLATFORM_SUPER_ADMIN")
                      }
                    />
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
