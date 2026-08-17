"use client";

import { ArrowRight, Check, Loader2, Store } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  completeOnboardingAction,
  type OnboardingActionState,
} from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { currencyOptions, defaultCurrency } from "@/config/currencies";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { plans } from "@/config/plans";
import { cn } from "@/lib/utils";

const initialState: OnboardingActionState = {
  status: "idle",
  message: "",
};

const planKeys = ["starter", "growth", "business"] as const;
const timezones = [
  "UTC",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <span className="text-destructive text-xs">{errors[0]}</span>;
}

export function OnboardingForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    completeOnboardingAction,
    initialState,
  );
  const slugInputRef = useRef<HTMLInputElement>(null);
  const slugEditedRef = useRef(false);
  const [planKey, setPlanKey] = useState<(typeof planKeys)[number]>("growth");
  const [timezone, setTimezone] = useState("UTC");

  useEffect(() => {
    formRef.current?.setAttribute("data-client-ready", "true");
  }, []);

  return (
    <form ref={formRef} action={formAction} className="space-y-8">
      <section className="space-y-4" aria-labelledby="business-heading">
        <div>
          <p className="text-primary text-xs font-semibold tracking-wider uppercase">
            Step 1 of 3
          </p>
          <h2 id="business-heading" className="mt-1 text-lg font-semibold">
            Business details
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
            Business name
            <Input
              name="businessName"
              onChange={(event) => {
                if (!slugEditedRef.current && slugInputRef.current)
                  slugInputRef.current.value = slugify(event.target.value);
              }}
              autoComplete="organization"
              placeholder="Acme Retail"
              minLength={2}
              maxLength={100}
              required
            />
            <FieldError errors={state.fieldErrors?.businessName} />
          </label>
          <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
            Workspace URL
            <div className="bg-card focus-within:outline-ring flex overflow-hidden rounded-md border focus-within:outline-2 focus-within:outline-offset-2">
              <span className="bg-muted text-muted-foreground flex items-center border-r px-3 text-sm">
                app.qenvaro.com/
              </span>
              <input
                name="businessSlug"
                ref={slugInputRef}
                onChange={(event) => {
                  slugEditedRef.current = true;
                  event.currentTarget.value =
                    event.currentTarget.value.toLowerCase();
                }}
                className="bg-card h-9 min-w-0 flex-1 px-3 text-sm"
                placeholder="acme-retail"
                minLength={3}
                maxLength={48}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
              />
            </div>
            <FieldError errors={state.fieldErrors?.businessSlug} />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Currency
            <SelectField
              ariaLabel="Currency"
              name="currency"
              defaultValue={defaultCurrency}
              options={currencyOptions}
            />
            <FieldError errors={state.fieldErrors?.currency} />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Language and format
            <SelectField
              ariaLabel="Language and format"
              name="locale"
              defaultValue="en-US"
              options={[
                { value: "en-US", label: "English (United States)" },
                { value: "en-GB", label: "English (United Kingdom)" },
                { value: "ur-PK", label: "Urdu (Pakistan)" },
              ]}
            />
            <FieldError errors={state.fieldErrors?.locale} />
          </label>
          <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
            Timezone
            <Input
              name="timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              list="qenvaro-timezones"
              maxLength={64}
              required
            />
            <datalist id="qenvaro-timezones">
              {timezones.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
            <FieldError errors={state.fieldErrors?.timezone} />
          </label>
        </div>
      </section>

      <section
        className="space-y-4 border-t pt-8"
        aria-labelledby="store-heading"
      >
        <div>
          <p className="text-primary text-xs font-semibold tracking-wider uppercase">
            Step 2 of 3
          </p>
          <h2 id="store-heading" className="mt-1 text-lg font-semibold">
            First store
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <label className="space-y-1.5 text-sm font-medium">
            Store name
            <div className="relative">
              <Store className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                name="storeName"
                defaultValue="Main Store"
                className="pl-9"
                minLength={2}
                maxLength={100}
                required
              />
            </div>
            <FieldError errors={state.fieldErrors?.storeName} />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Store code
            <Input
              name="storeCode"
              defaultValue="MAIN"
              minLength={2}
              maxLength={12}
              required
            />
            <FieldError errors={state.fieldErrors?.storeCode} />
          </label>
        </div>
      </section>

      <section
        className="space-y-4 border-t pt-8"
        aria-labelledby="plan-heading"
      >
        <div>
          <p className="text-primary text-xs font-semibold tracking-wider uppercase">
            Step 3 of 3
          </p>
          <h2 id="plan-heading" className="mt-1 text-lg font-semibold">
            Choose your 14-day trial
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            No card is required today. Billing setup comes before the trial
            ends.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {planKeys.map((key) => {
            const plan = plans[key];
            const selected = planKey === key;
            return (
              <label
                key={key}
                className={cn(
                  "relative cursor-pointer rounded-xl border p-4 transition-colors",
                  selected
                    ? "border-primary bg-accent/60"
                    : "bg-card hover:bg-muted/50",
                )}
              >
                <input
                  type="radio"
                  name="planKey"
                  value={key}
                  checked={selected}
                  onChange={() => setPlanKey(key)}
                  className="sr-only"
                />
                {selected && (
                  <span className="bg-primary text-primary-foreground absolute top-3 right-3 flex size-5 items-center justify-center rounded-full">
                    <Check className="size-3" />
                  </span>
                )}
                <span className="block font-semibold">{plan.name}</span>
                <span className="mt-2 block text-2xl font-bold">
                  ${(plan.monthlyPriceMinor ?? 0) / 100}
                  <span className="text-muted-foreground text-xs font-normal">
                    {" "}
                    /mo
                  </span>
                </span>
                <span className="text-muted-foreground mt-2 block text-xs leading-5">
                  {plan.limits.stores}{" "}
                  {plan.limits.stores === 1 ? "store" : "stores"} ·{" "}
                  {plan.limits.members} members ·{" "}
                  {plan.limits.products?.toLocaleString()} products
                </span>
              </label>
            );
          })}
        </div>
        <FieldError errors={state.fieldErrors?.planKey} />
      </section>

      {state.status === "error" && (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
        >
          {state.message}
        </p>
      )}
      <div className="flex flex-col-reverse items-center justify-between gap-3 border-t pt-6 sm:flex-row">
        <p className="text-muted-foreground text-xs">
          You can change store and regional settings later.
        </p>
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="w-full sm:w-auto"
        >
          {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          {pending ? "Creating workspace…" : "Create workspace"}
        </Button>
      </div>
    </form>
  );
}
