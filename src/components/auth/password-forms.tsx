"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        const form = new FormData(event.currentTarget);
        await authClient.requestPasswordReset({
          email: String(form.get("email")),
          redirectTo: "/reset-password",
        });
        setPending(false);
        setSent(true);
      }}
    >
      <label className="block space-y-1.5 text-sm font-medium">
        Email
        <Input name="email" type="email" autoComplete="email" required />
      </label>
      {sent && (
        <p
          role="status"
          className="bg-success/20 text-success-foreground rounded-lg p-3 text-sm"
        >
          If that address has an account, password-reset instructions are on the
          way.
        </p>
      )}
      <Button className="w-full" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset instructions"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token?: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  if (!token)
    return (
      <p
        role="alert"
        className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
      >
        This reset link is missing its secure token. Request a new link.
      </p>
    );
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setMessage("");
        const form = new FormData(event.currentTarget);
        const response = await authClient.resetPassword({
          token,
          newPassword: String(form.get("password")),
        });
        setMessage(
          response.error
            ? (response.error.message ??
                "This reset link is invalid or expired.")
            : "Password updated. You can now sign in.",
        );
        setPending(false);
      }}
    >
      <label className="block space-y-1.5 text-sm font-medium">
        New password
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
        />
        <span className="text-muted-foreground block text-xs font-normal">
          At least 12 characters.
        </span>
      </label>
      {message && (
        <p role="status" className="bg-muted rounded-lg p-3 text-sm">
          {message}
        </p>
      )}
      <Button className="w-full" type="submit" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
