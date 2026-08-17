"use client";

import {
  CheckCircle2,
  Cloud,
  Download,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  Webhook,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { requestDataOperationAction } from "@/app/app/[tenantSlug]/settings/business/actions";
import {
  SettingsActionMessage,
  settingsInitialState,
} from "@/components/settings/action-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import type { TenantSettingsProjection } from "@/modules/settings/schemas";

function secretFromUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? uri;
  } catch {
    return uri;
  }
}

function DataRequestForm({
  tenantSlug,
  type,
  disabled,
}: {
  tenantSlug: string;
  type: "export" | "deletion";
  disabled: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    requestDataOperationAction.bind(null, tenantSlug, type),
    settingsInitialState,
  );
  React.useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
    router.refresh();
  }, [router, state]);
  const destructive = type === "deletion";
  const confirmation = destructive ? "REQUEST DELETION" : "REQUEST EXPORT";
  return (
    <form action={action} className="space-y-3 rounded-xl border p-4">
      <div className="flex items-start gap-3">
        <span
          className={
            destructive
              ? "bg-destructive/10 text-destructive flex size-9 items-center justify-center rounded-lg"
              : "bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg"
          }
        >
          {destructive ? (
            <Trash2 className="size-4" />
          ) : (
            <Download className="size-4" />
          )}
        </span>
        <div>
          <p className="text-sm font-semibold">
            {destructive ? "Request tenant deletion" : "Request data export"}
          </p>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            {destructive
              ? "Starts a controlled, reviewed deletion workflow. This browser action never immediately erases tenant records."
              : "Starts a controlled export workflow. Restricted compensation fields remain permission protected."}
          </p>
        </div>
      </div>
      <label className="block space-y-1.5 text-xs font-medium">
        Enter {confirmation} to confirm
        <Input
          name="confirmation"
          required
          autoComplete="off"
          placeholder={confirmation}
          disabled={disabled}
        />
      </label>
      <SettingsActionMessage state={state} />
      <Button
        type="submit"
        size="sm"
        variant={destructive ? "destructive" : "outline"}
        disabled={disabled || pending}
      >
        {pending && <Loader2 className="animate-spin" />}
        Submit request
      </Button>
    </form>
  );
}

function TenantTwoFactor({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");
  const [totpUri, setTotpUri] = React.useState("");
  const [backupCodes, setBackupCodes] = React.useState<string[]>([]);
  const [savedCodes, setSavedCodes] = React.useState(false);

  if (enabled) {
    return (
      <div className="space-y-4">
        <div className="bg-success/10 text-success-foreground flex items-center gap-3 rounded-xl border p-4 text-sm">
          <CheckCircle2 className="size-5 shrink-0" />
          Authenticator-based two-factor authentication is enabled.
        </div>
        <form
          className="max-w-md space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError("");
            const password = String(
              new FormData(event.currentTarget).get("password"),
            );
            const response = await authClient.twoFactor.disable({ password });
            if (response.error) {
              setError(
                response.error.message ??
                  "Two-factor authentication could not be disabled.",
              );
              setPending(false);
              return;
            }
            toast.success("Two-factor authentication disabled.");
            router.refresh();
          }}
        >
          <label className="block space-y-1.5 text-sm font-medium">
            Confirm password to disable
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
          <Button type="submit" variant="outline" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Disable two-factor
          </Button>
        </form>
      </div>
    );
  }

  if (!totpUri) {
    return (
      <form
        className="max-w-md space-y-3"
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
              response.error?.message ??
                "Two-factor enrollment could not start.",
            );
            setPending(false);
            return;
          }
          setTotpUri(response.data.totpURI);
          setBackupCodes(response.data.backupCodes);
          setPending(false);
        }}
      >
        <p className="text-muted-foreground text-sm leading-6">
          Add an authenticator app challenge to your account. Owners and
          administrators are strongly encouraged to enable it.
        </p>
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
          Start enrollment
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold">1. Add the setup key</p>
        <code className="bg-muted mt-2 block rounded-lg p-3 font-mono text-sm font-semibold tracking-wider break-all">
          {secretFromUri(totpUri)}
        </code>
      </div>
      <div>
        <p className="text-sm font-semibold">2. Save recovery codes offline</p>
        <div className="bg-muted mt-2 grid gap-2 rounded-lg p-3 font-mono text-xs sm:grid-cols-2">
          {backupCodes.map((code) => (
            <code key={code}>{code}</code>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <Checkbox
            checked={savedCodes}
            onCheckedChange={(value) => setSavedCodes(value === true)}
          />
          I saved these one-time recovery codes.
        </label>
      </div>
      <form
        className="max-w-md space-y-3"
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
          toast.success("Two-factor authentication enabled.");
          router.refresh();
        }}
      >
        <label className="block space-y-1.5 text-sm font-medium">
          3. Verify a six-digit code
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
          Verify and enable
        </Button>
      </form>
    </div>
  );
}

export function SecurityDataSettings({
  tenantSlug,
  settings,
  twoFactorEnabled,
  canManage,
  canRequestDeletion,
  isDemo,
}: {
  tenantSlug: string;
  settings: TenantSettingsProjection;
  twoFactorEnabled: boolean;
  canManage: boolean;
  canRequestDeletion: boolean;
  isDemo: boolean;
}) {
  const integrations = [
    {
      label: "Google OAuth",
      icon: KeyRound,
      configured: settings.integrations.googleOAuth,
    },
    {
      label: "Stripe billing",
      icon: Webhook,
      configured: settings.integrations.stripe,
    },
    {
      label: "Cloudinary media",
      icon: Cloud,
      configured: settings.integrations.cloudinary,
    },
    {
      label: "Transactional email",
      icon: Mail,
      configured: settings.integrations.email,
    },
  ];
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" /> Account security
          </CardTitle>
          <CardDescription>
            Two-factor protection applies to your global account across every
            business.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isDemo ? (
            <p className="text-muted-foreground text-sm">
              Account security mutations are disabled in the public demo.
            </p>
          ) : (
            <TenantTwoFactor enabled={twoFactorEnabled} />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Integration readiness</CardTitle>
          <CardDescription>
            Server-side provider configuration. Secrets are never exposed here.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {integrations.map((integration) => (
            <div
              key={integration.label}
              className="flex items-center gap-3 rounded-xl border p-3"
            >
              <span className="bg-muted flex size-9 items-center justify-center rounded-lg">
                <integration.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium">
                {integration.label}
              </span>
              <Badge variant={integration.configured ? "success" : "secondary"}>
                {integration.configured ? "Ready" : "Not set"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Data controls</CardTitle>
          <CardDescription>
            Export and deletion are queued for a controlled server-side review;
            neither runs directly from the browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.pendingDataRequests.length > 0 && (
            <div className="bg-muted/60 rounded-xl border p-4">
              <p className="text-sm font-semibold">Pending requests</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {settings.pendingDataRequests.map((request) => (
                  <Badge
                    key={request.id}
                    variant="warning"
                    className="capitalize"
                  >
                    {request.type} · {request.status}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <DataRequestForm
              tenantSlug={tenantSlug}
              type="export"
              disabled={isDemo || !canManage}
            />
            <DataRequestForm
              tenantSlug={tenantSlug}
              type="deletion"
              disabled={isDemo || !canRequestDeletion}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
