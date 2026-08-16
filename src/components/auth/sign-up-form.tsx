"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function SignUpForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError("");
        setMessage("");
        const form = new FormData(event.currentTarget);
        const response = await authClient.signUp.email({
          name: String(form.get("name")),
          email: String(form.get("email")),
          password: String(form.get("password")),
          callbackURL: "/onboarding",
        });
        if (response.error)
          setError(response.error.message ?? "Account creation failed.");
        else
          setMessage(
            "Check your inbox to verify your email before signing in.",
          );
        setPending(false);
      }}
    >
      <label className="block space-y-1.5 text-sm font-medium">
        Full name
        <Input name="name" autoComplete="name" required minLength={2} />
      </label>
      <label className="block space-y-1.5 text-sm font-medium">
        Work email
        <Input name="email" type="email" autoComplete="email" required />
      </label>
      <label className="block space-y-1.5 text-sm font-medium">
        Password
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
        <span className="text-muted-foreground block text-xs font-normal">
          At least 12 characters.
        </span>
      </label>
      {error && (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="bg-success/20 text-success-foreground rounded-lg p-3 text-sm"
        >
          {message}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Create account
      </Button>
      <p className="text-muted-foreground text-center text-xs">
        By continuing, you agree to the Terms and Privacy Policy, both pending
        legal review.
      </p>
    </form>
  );
}
