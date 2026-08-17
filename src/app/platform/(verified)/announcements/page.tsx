import { Megaphone } from "lucide-react";
import type { Metadata } from "next";
import {
  ArchiveAnnouncementButton,
  NewAnnouncementDialog,
} from "@/components/platform/control-actions";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireVerifiedPlatformContext } from "@/server/auth/platform-context";
import { getPlatformAnnouncements } from "@/server/repositories/platform-control";

export const metadata: Metadata = { title: "Platform announcements" };
function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(value))
    : "No end date";
}
export default async function PlatformAnnouncementsPage() {
  const context = await requireVerifiedPlatformContext();
  const items = await getPlatformAnnouncements(context);
  return (
    <PageContainer size="narrow">
      <PageHeader
        eyebrow="Platform"
        title="Announcements"
        description="Time-bounded platform messages delivered through authenticated tenant notification centers."
        actions={<NewAnnouncementDialog />}
      />
      {items.length === 0 ? (
        <Card className="p-10 text-center">
          <Megaphone className="text-muted-foreground mx-auto size-8" />
          <p className="mt-3 font-semibold">No announcements</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{item.title}</h2>
                    <Badge
                      variant={
                        item.status === "published" ? "success" : "secondary"
                      }
                      className="capitalize"
                    >
                      {item.status}
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {item.severity}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-2 text-sm leading-6">
                    {item.message}
                  </p>
                  <p className="text-muted-foreground mt-2 text-xs">
                    Visible {date(item.startsAt)} through {date(item.endsAt)}
                  </p>
                </div>
                {item.status === "published" && (
                  <ArchiveAnnouncementButton id={item.id} />
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
