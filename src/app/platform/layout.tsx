import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlatformShell } from "@/components/platform/platform-shell";
import { requirePlatformIdentity } from "@/server/auth/platform-context";

export const metadata: Metadata = { title: "Platform" };
export const dynamic = "force-dynamic";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let identity;
  try {
    identity = await requirePlatformIdentity();
  } catch {
    notFound();
  }
  return <PlatformShell identity={identity}>{children}</PlatformShell>;
}
