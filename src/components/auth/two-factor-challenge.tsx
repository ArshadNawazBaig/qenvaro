"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { hasPlatformSuperAdminRole } from "@/modules/platform/access-policy";

export function TwoFactorChallenge() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [backupMode, setBackupMode] = useState(false);
  const [error, setError] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError("");
        const form = new FormData(event.currentTarget);
        const code = String(form.get("code")).trim();
        const response = backupMode
          ? await authClient.twoFactor.verifyBackupCode({
              code,
              trustDevice: false,
            })
          : await authClient.twoFactor.verifyTotp({
              code,
              trustDevice: false,
            });
        if (response.error) {
          setError(
            response.error.message ?? "The verification code is invalid.",
          );
          setPending(false);
          return;
        }
        const user = response.data?.user as { role?: unknown } | undefined;
        router.replace(
          hasPlatformSuperAdminRole(user?.role) ? "/platform" : "/onboarding",
        );
        router.refresh();
      }}
    >
      <div className="bg-accent text-accent-foreground flex items-start gap-3 rounded-xl p-4 text-sm">
        <KeyRound className="mt-0.5 size-4 shrink-0" />
        <p>
          {backupMode
            ? "Enter one unused recovery code. It will be consumed after verification."
            : "Enter the six-digit code from your authenticator app."}
        </p>
      </div>
      <label className="block space-y-1.5 text-sm font-medium">
        {backupMode ? "Recovery code" : "Authenticator code"}
        <Input
          name="code"
          inputMode={backupMode ? "text" : "numeric"}
          autoComplete="one-time-code"
          pattern={backupMode ? undefined : "[0-9]{6}"}
          minLength={backupMode ? 8 : 6}
          maxLength={backupMode ? 64 : 6}
          required
          autoFocus
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
        {pending && <Loader2 className="animate-spin" />}
        Verify and continue
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        disabled={pending}
        onClick={() => {
          setBackupMode((value) => !value);
          setError("");
        }}
      >
        {backupMode ? "Use authenticator code" : "Use a recovery code"}
      </Button>
    </form>
  );
}
