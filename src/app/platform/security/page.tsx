import type { Metadata } from "next";
import { PlatformTwoFactorSetup } from "@/components/platform/two-factor-setup";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { requirePlatformIdentity } from "@/server/auth/platform-context";

export const metadata: Metadata = { title: "Platform security" };

export default async function PlatformSecurityPage() {
  const identity = await requirePlatformIdentity();
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-2">
        <Badge variant="warning">Security gateway</Badge>
        <span className="text-muted-foreground text-xs">
          No tenant or subscription data is loaded on this route.
        </span>
      </div>
      <PageHeader
        eyebrow="Platform"
        title="Two-factor security"
        description="Enroll or verify the current session before entering the platform control plane."
      />
      <PlatformTwoFactorSetup
        enabled={identity.twoFactorEnabled}
        sessionAssured={identity.sessionAssured}
      />
    </div>
  );
}
