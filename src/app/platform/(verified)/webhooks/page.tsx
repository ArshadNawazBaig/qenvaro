import { Webhook } from "lucide-react";
import type { Metadata } from "next";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireVerifiedPlatformContext } from "@/server/auth/platform-context";
import { getPlatformWebhooks } from "@/server/repositories/platform-control";

export const metadata: Metadata = { title: "Webhook events" };
function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(value))
    : "Not available";
}
export default async function PlatformWebhooksPage() {
  const context = await requireVerifiedPlatformContext();
  const items = await getPlatformWebhooks(context);
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Platform"
        title="Verified webhook events"
        description="Signature-verified event identifiers and projection outcomes. Raw payloads and secrets are never exposed."
        actions={<Badge variant="outline">Latest {items.length}</Badge>}
      />
      {items.length === 0 ? (
        <Card className="p-10 text-center">
          <Webhook className="text-muted-foreground mx-auto size-8" />
          <p className="mt-3 font-semibold">No verified events yet</p>
        </Card>
      ) : (
        <Card>
          {items.map((item) => (
            <article
              key={item.id}
              className="bg-card grid gap-3 border-b p-5 last:border-b-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,.7fr)_minmax(0,1fr)] lg:items-center"
            >
              <div>
                <p className="font-mono text-xs font-semibold">
                  {item.eventId}
                </p>
                <p className="text-muted-foreground mt-1 text-xs capitalize">
                  {item.provider}
                </p>
              </div>
              <p className="text-sm">{item.type}</p>
              <div>
                <Badge
                  variant={
                    item.status === "processed" || item.status === "completed"
                      ? "success"
                      : item.status === "failed"
                        ? "destructive"
                        : "warning"
                  }
                  className="capitalize"
                >
                  {item.status}
                </Badge>
                <p className="text-muted-foreground mt-1 text-xs">
                  {item.attempts} attempts
                </p>
              </div>
              <div>
                <p className="text-xs">Verified {date(item.verifiedAt)}</p>
                {item.errorName && (
                  <p className="text-destructive mt-1 text-xs">
                    {item.errorName}
                  </p>
                )}
              </div>
            </article>
          ))}
        </Card>
      )}
    </PageContainer>
  );
}
