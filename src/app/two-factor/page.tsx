import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { TwoFactorChallenge } from "@/components/auth/two-factor-challenge";
import { redirectAuthenticatedUserFromGuestRoute } from "@/server/auth/guest-route";

export const metadata: Metadata = { title: "Two-factor verification" };

export default async function TwoFactorPage() {
  await redirectAuthenticatedUserFromGuestRoute();
  return (
    <AuthCard
      title="Verify it’s you"
      description="Complete the second step to create your secure session."
      footer={
        <Link href="/sign-in" className="text-primary hover:underline">
          Return to sign in
        </Link>
      }
    >
      <TwoFactorChallenge />
    </AuthCard>
  );
}
