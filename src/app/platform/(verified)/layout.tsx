import { requireVerifiedPlatformContext } from "@/server/auth/platform-context";

export default async function VerifiedPlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVerifiedPlatformContext();
  return children;
}
