import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/password-forms";
import { redirectAuthenticatedUserFromGuestRoute } from "@/server/auth/guest-route";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  await redirectAuthenticatedUserFromGuestRoute();
  const { token } = await searchParams;
  return (
    <AuthCard
      title="Choose a new password"
      description="Your new password will revoke other active sessions."
      footer={
        <Link
          href="/sign-in"
          className="text-primary font-medium hover:underline"
        >
          Return to sign in
        </Link>
      }
    >
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
