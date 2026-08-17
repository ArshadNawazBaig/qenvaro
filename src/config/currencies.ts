export const currencyCodes = [
  "AED",
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "EUR",
  "GBP",
  "INR",
  "NZD",
  "PKR",
  "QAR",
  "SAR",
  "SGD",
  "TRY",
  "USD",
  "ZAR",
] as const;

export type CurrencyCode = (typeof currencyCodes)[number];

export const defaultCurrency: CurrencyCode = "USD";

const currencyNames: Record<CurrencyCode, string> = {
  AED: "UAE Dirham",
  AUD: "Australian Dollar",
  CAD: "Canadian Dollar",
  CHF: "Swiss Franc",
  CNY: "Chinese Yuan",
  EUR: "Euro",
  GBP: "British Pound",
  INR: "Indian Rupee",
  NZD: "New Zealand Dollar",
  PKR: "Pakistani Rupee",
  QAR: "Qatari Riyal",
  SAR: "Saudi Riyal",
  SGD: "Singapore Dollar",
  TRY: "Turkish Lira",
  USD: "US Dollar",
  ZAR: "South African Rand",
};

export const currencyOptions = currencyCodes.map((value) => ({
  value,
  label: `${value} — ${currencyNames[value]}`,
}));

export function safeCurrency(value: unknown): string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value)
    ? value
    : defaultCurrency;
}
