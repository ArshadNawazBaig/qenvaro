import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public landing and product demo are usable", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Every store/i }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Explore demo/i }).click();
  await expect(
    page.getByRole("heading", { name: "Business overview" }),
  ).toBeVisible({ timeout: 20_000 });
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 700 });
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "Business overview" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBe(0);
  if (originalViewport) {
    await page.setViewportSize(originalViewport);
    await page.reload({ waitUntil: "networkidle" });
  }
  await page.getByRole("link", { name: "View catalog", exact: true }).click();
  await expect(page).toHaveURL(/\/products$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  const productsUrl = page.url();
  await page.getByRole("link", { name: "Categories", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Categories", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New category" }),
  ).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.goto(productsUrl);
  await page
    .getByRole("main")
    .getByRole("link", { name: "Tags", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tags", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("button", { name: "New tag" })).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBe(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (originalViewport) await page.setViewportSize(originalViewport);
  await page.goto(productsUrl);
  await page.getByRole("link", { name: "Growth Suite", exact: true }).click();
  await expect(page).toHaveURL(/\/products\/prd_growth_suite$/);
  await expect(
    page.getByRole("heading", { name: "Growth Suite", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Demo products are read-only")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
