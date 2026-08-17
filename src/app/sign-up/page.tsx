import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { redirectAuthenticatedUserFromGuestRoute } from "@/server/auth/guest-route";

export default async function SignUpPage() {
  await redirectAuthenticatedUserFromGuestRoute();
  return (
    <AuthCard
      title="Create your workspace"
      description="Start with your account. We’ll guide you through the business setup next."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="text-primary font-medium hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
