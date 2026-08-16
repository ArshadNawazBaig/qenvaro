"use client";

import { CheckCircle2, Copy, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

function secretFromTotpUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

export function PlatformTwoFactorSetup({
  enabled,
  sessionAssured,
}: {
  enabled: boolean;
  sessionAssured: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [savedCodes, setSavedCodes] = useState(false);
  const [backupMode, setBackupMode] = useState(false);

  if (enabled && sessionAssured) {
    return (
      <Card className="max-w-2xl">
        <CardContent className="p-6 sm:p-8">
          <span className="bg-success/30 text-success-foreground flex size-11 items-center justify-center rounded-full">
            <CheckCircle2 className="size-5" />
          </span>
          <h2 className="mt-5 text-xl font-semibold">This session is verified</h2>
          <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-6">
            Two-factor authentication is enabled and this browser session has
            completed a second-factor check.
          </p>
          <Button asChild className="mt-6">
            <Link href="/platform">Open platform overview</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (enabled) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <div className="bg-accent text-accent-foreground mb-3 flex size-10 items-center justify-center rounded-lg">
            <KeyRound className="size-5" />
          </div>
          <CardTitle>Verify this session</CardTitle>
          <p className="text-muted-foreground text-sm">
            Platform data remains locked until this browser session completes a
            second-factor check.
          </p>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setPending(true);
              setError("");
              const code = String(
                new FormData(event.currentTarget).get("code"),
              ).trim();
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
              router.replace("/platform");
              router.refresh();
            }}
          >
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
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Verify platform session
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setBackupMode((value) => !value);
                  setError("");
                }}
              >
                {backupMode ? "Use authenticator" : "Use recovery code"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="bg-warning/30 text-warning-foreground mb-3 flex size-10 items-center justify-center rounded-lg">
          <ShieldCheck className="size-5" />
        </div>
        <CardTitle>Enroll an authenticator app</CardTitle>
        <p className="text-muted-foreground text-sm leading-6">
          Platform access requires TOTP. Your password is verified directly by
          Better Auth and is never submitted to a platform action.
        </p>
      </CardHeader>
      <CardContent>
        {!totpUri ? (
          <form
            className="max-w-md space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setPending(true);
              setError("");
              const password = String(
                new FormData(event.currentTarget).get("password"),
              );
              const response = await authClient.twoFactor.enable({ password });
              if (response.error || !response.data) {
                setError(
                  response.error?.message ?? "Two-factor setup could not start.",
                );
                setPending(false);
                return;
              }
              setTotpUri(response.data.totpURI);
              setBackupCodes(response.data.backupCodes);
              setPending(false);
            }}
          >
            <label className="block space-y-1.5 text-sm font-medium">
              Confirm your password
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                minLength={12}
                required
              />
            </label>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Start secure enrollment
            </Button>
          </form>
        ) : (
          <div className="space-y-6">
            <section className="space-y-2" aria-labelledby="manual-key-title">
              <h3 id="manual-key-title" className="font-semibold">
                1. Add the manual setup key
              </h3>
              <p className="text-muted-foreground text-sm">
                Add a time-based account in your authenticator app with this key.
              </p>
              <div className="bg-muted flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center">
                <code
                  className="min-w-0 flex-1 break-all font-mono text-sm font-semibold tracking-wider"
                  data-testid="totp-secret"
                >
                  {secretFromTotpUri(totpUri)}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(secretFromTotpUri(totpUri));
                    toast.success("Setup key copied.");
                  }}
                >
                  <Copy /> Copy
                </Button>
              </div>
            </section>
            <section className="space-y-2" aria-labelledby="backup-title">
              <h3 id="backup-title" className="font-semibold">
                2. Save your recovery codes
              </h3>
              <p className="text-muted-foreground text-sm">
                Store these one-time codes offline. They will not be shown again.
              </p>
              <div className="bg-muted grid gap-2 rounded-lg p-4 font-mono text-sm sm:grid-cols-2">
                {backupCodes.map((code) => (
                  <code key={code}>{code}</code>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={savedCodes}
                  onCheckedChange={(checked) => setSavedCodes(checked === true)}
                />
                I saved the recovery codes in a secure location.
              </label>
            </section>
            <form
              className="max-w-md space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setPending(true);
                setError("");
                const code = String(
                  new FormData(event.currentTarget).get("code"),
                ).trim();
                const response = await authClient.twoFactor.verifyTotp({
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
                router.replace("/platform");
                router.refresh();
              }}
            >
              <h3 className="font-semibold">3. Verify the first code</h3>
              <label className="block space-y-1.5 text-sm font-medium">
                Six-digit authenticator code
                <Input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  required
                />
              </label>
              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={pending || !savedCodes}>
                {pending && <Loader2 className="animate-spin" />}
                Verify and unlock platform
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
