import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { redirectAuthenticatedUserFromGuestRoute } from "@/server/auth/guest-route";

export default async function ForgotPasswordPage() {
  await redirectAuthenticatedUserFromGuestRoute();
  return (
    <AuthCard
      title="Reset your password"
      description="We’ll send a short-lived, single-use reset link."
      footer={
        <Link
          href="/sign-in"
          className="text-primary font-medium hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
