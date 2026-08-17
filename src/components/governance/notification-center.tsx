"use client";

import { Bell, Check, CircleAlert, Info, Megaphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { markNotificationReadAction } from "@/app/app/[tenantSlug]/notifications/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { NotificationItem } from "@/server/repositories/governance";

function Icon({ item }: { item: NotificationItem }) {
  if (item.source === "platform") return <Megaphone className="size-5" />;
  if (item.severity === "critical" || item.severity === "warning")
    return <CircleAlert className="size-5" />;
  if (item.severity === "success") return <Check className="size-5" />;
  return <Info className="size-5" />;
}

export function NotificationCenter({
  tenantSlug,
  items,
}: {
  tenantSlug: string;
  items: NotificationItem[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState("");
  if (items.length === 0)
    return (
      <Card className="p-10 text-center">
        <Bell className="text-muted-foreground mx-auto size-8" />
        <p className="mt-3 font-semibold">You’re all caught up</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Operational alerts and platform announcements will appear here.
        </p>
      </Card>
    );
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Card
          key={item.id}
          className={`p-4 sm:p-5 ${item.read ? "opacity-75" : "border-primary/30"}`}
        >
          <div className="flex items-start gap-3">
            <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
              <Icon item={item} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{item.title}</h2>
                {!item.read && <Badge variant="info">New</Badge>}
                <Badge variant="outline" className="capitalize">
                  {item.source}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                {item.message}
              </p>
              <p className="text-muted-foreground mt-2 text-xs">
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(item.createdAt))}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              {item.href && (
                <Button asChild size="sm" variant="outline">
                  <Link href={item.href}>Open</Link>
                </Button>
              )}
              {!item.read && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pendingId === item.id}
                  onClick={() => {
                    setPendingId(item.id);
                    React.startTransition(async () => {
                      const result = await markNotificationReadAction(
                        tenantSlug,
                        item.id,
                      );
                      if (result.status === "success")
                        toast.success(result.message);
                      else toast.error(result.message);
                      setPendingId("");
                      router.refresh();
                    });
                  }}
                >
                  <Check />
                  {pendingId === item.id ? "Saving…" : "Mark read"}
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
