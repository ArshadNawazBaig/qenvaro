import { z } from "zod";

export const moneySchema = z.object({
  amountMinor: z.int().safe(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export type Money = z.infer<typeof moneySchema>;

export function formatMoney(money: Money, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(money.amountMinor / 100);
}

export function addMoney(values: readonly Money[]): Money {
  if (values.length === 0) return { amountMinor: 0, currency: "USD" };
  const currency = values[0]?.currency ?? "USD";
  if (values.some((value) => value.currency !== currency)) {
    throw new Error("Cannot add monetary values with different currencies.");
  }
  return {
    amountMinor: values.reduce((total, value) => total + value.amountMinor, 0),
    currency,
  };
}

export function parseDecimalToMinor(value: string): number {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match)
    throw new Error(
      "Enter a valid amount with no more than two decimal places.",
    );
  const whole = Number(match[1]);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const amountMinor = whole * 100 + Number(fraction);
  if (!Number.isSafeInteger(amountMinor))
    throw new Error("The amount is too large.");
  return amountMinor;
}
