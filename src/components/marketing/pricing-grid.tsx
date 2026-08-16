"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { plans, type PlanKey } from "@/config/plans";
import { cn } from "@/lib/utils";

const features: Record<PlanKey, string[]> = {
  starter: [
    "1 store",
    "5 team members",
    "1,000 products",
    "Core operations",
    "Basic reports",
  ],
  growth: [
    "3 stores",
    "25 team members",
    "10,000 products",
    "Purchasing and payroll",
    "CSV and advanced reports",
  ],
  business: [
    "10 stores",
    "100 team members",
    "100,000 products",
    "Custom roles and audit",
    "Multi-store reporting",
  ],
  enterprise: [
    "Contract limits",
    "Custom pricing",
    "Advanced controls",
    "Priority support",
    "Optional infrastructure",
  ],
};

export function PricingGrid() {
  const [annual, setAnnual] = useState(true);
  return (
    <>
      <div className="bg-card mx-auto mb-10 flex w-fit rounded-lg border p-1">
        <button
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium",
            !annual && "bg-foreground text-background",
          )}
          onClick={() => setAnnual(false)}
        >
          Monthly
        </button>
        <button
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium",
            annual && "bg-foreground text-background",
          )}
          onClick={() => setAnnual(true)}
        >
          Annual <span className="ml-1 opacity-70">save 17%</span>
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        {Object.values(plans).map((plan) => {
          const price = annual ? plan.annualPriceMinor : plan.monthlyPriceMinor;
          const display =
            price === null
              ? "Let’s talk"
              : formatMoney({
                  amountMinor: annual ? Math.round(price / 12) : price,
                  currency: plan.currency,
                });
          const highlighted = plan.key === "growth";
          return (
            <Card key={plan.key} className="flex flex-col">
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription className="min-h-10">
                  {plan.description}
                </CardDescription>
                {highlighted && (
                  <CardAction>
                    <Badge>Most popular</Badge>
                  </CardAction>
                )}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <div>
                  <span className="text-3xl font-semibold tracking-tight">
                    {display}
                  </span>
                  {price !== null && (
                    <span className="text-muted-foreground text-sm">
                      {" "}
                      / month
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {price !== null && annual ? "Billed annually" : " "}
                </p>
                <Button
                  className="mt-6"
                  variant={highlighted ? "default" : "outline"}
                >
                  {plan.key === "enterprise"
                    ? "Contact sales"
                    : "Start free trial"}
                </Button>
                <ul className="mt-6 space-y-3">
                  {features[plan.key].map((feature) => (
                    <li key={feature} className="flex gap-2 text-sm">
                      <Check className="text-success-foreground mt-0.5 size-4 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
