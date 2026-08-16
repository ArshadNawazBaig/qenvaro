import { notFound, redirect } from "next/navigation";
import {
  PlatformTwoFactorRequiredError,
  requireVerifiedPlatformContext,
} from "@/server/auth/platform-context";

export default async function VerifiedPlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireVerifiedPlatformContext();
  } catch (error) {
    if (error instanceof PlatformTwoFactorRequiredError)
      redirect("/platform/security");
    notFound();
  }
  return children;
}
