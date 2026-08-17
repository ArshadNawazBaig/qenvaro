import { z } from "zod";

export const globalSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
});

export const globalSearchResultKinds = [
  "product",
  "customer",
  "employee",
  "setting",
] as const;

export interface GlobalSearchResult {
  id: string;
  kind: (typeof globalSearchResultKinds)[number];
  title: string;
  description: string;
  href: string;
}
