import { Flag } from "lucide-react";
import type { Metadata } from "next";
import {
  NewFeatureFlagDialog,
  TenantFlagOverrideForm,
} from "@/components/platform/control-actions";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireVerifiedPlatformContext } from "@/server/auth/platform-context";
import { getPlatformFlags } from "@/server/repositories/platform-control";

export const metadata: Metadata = { title: "Feature flags" };
export default async function PlatformFeatureFlagsPage() {
  const context = await requireVerifiedPlatformContext();
  const flags = await getPlatformFlags(context);
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Platform"
        title="Feature flags"
        description="Controlled release switches with auditable tenant overrides. Flags cannot bypass plans or permissions."
        actions={<NewFeatureFlagDialog />}
      />
      {flags.length === 0 ? (
        <Card className="p-10 text-center">
          <Flag className="text-muted-foreground mx-auto size-8" />
          <p className="mt-3 font-semibold">No release flags configured</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Core entitlements remain governed by the plan catalog.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {flags.map((flag) => (
            <Card key={flag.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold">{flag.key}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {flag.description}
                  </p>
                </div>
                <Badge variant={flag.defaultEnabled ? "success" : "secondary"}>
                  {flag.defaultEnabled ? "Default on" : "Default off"}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-3 text-xs">
                {flag.overrides} tenant overrides
              </p>
              <TenantFlagOverrideForm flagId={flag.id} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
