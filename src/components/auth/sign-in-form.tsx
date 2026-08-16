"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function SignInForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-5">
      <Button
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError("");
          const response = await authClient.signIn.social({
            provider: "google",
            callbackURL: "/onboarding",
          });
          if (response.error) {
            setError("Google sign-in is not configured yet.");
            setPending(false);
          }
        }}
      >
        <span className="text-base font-bold">G</span> Continue with Google
      </Button>
      <div className="flex items-center gap-3">
        <span className="bg-border h-px flex-1" />
        <span className="text-muted-foreground text-[11px] font-medium uppercase">
          or use email
        </span>
        <span className="bg-border h-px flex-1" />
      </div>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError("");
          const form = new FormData(event.currentTarget);
          const response = await authClient.signIn.email({
            email: String(form.get("email")),
            password: String(form.get("password")),
            callbackURL: "/onboarding",
          });
          if (response.error) {
            setError(response.error.message ?? "Sign in failed.");
            setPending(false);
          }
        }}
      >
        <label className="block space-y-1.5 text-sm font-medium">
          Email
          <Input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
          />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          <span className="flex justify-between">
            Password
            <Link
              href="/forgot-password"
              className="text-primary text-xs font-normal hover:underline"
            >
              Forgot password?
            </Link>
          </span>
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={12}
            required
          />
        </label>
        {error && (
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
          >
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Sign in
        </Button>
      </form>
    </div>
  );
}
