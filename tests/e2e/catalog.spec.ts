import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public landing and product demo are usable", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Every store/i }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Explore demo/i }).click();
  await expect(
    page.getByRole("heading", { name: /Good morning/i }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Review products", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
