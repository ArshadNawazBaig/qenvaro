import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";

export default function SignInPage() {
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your Qenvaro workspace."
      footer={
        <>
          New to Qenvaro?{" "}
          <Link
            href="/sign-up"
            className="text-primary font-medium hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <SignInForm />
    </AuthCard>
  );
}
