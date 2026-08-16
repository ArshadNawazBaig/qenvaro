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
  const periodControl = page.getByRole("group", {
    name: "Dashboard reporting period",
  });
  await expect(
    periodControl.getByRole("link", { name: "7 days" }),
  ).toHaveAttribute("aria-current", "page");
  await periodControl.getByRole("link", { name: "30 days" }).click();
  await expect(page).toHaveURL(/\?range=30d$/);
  await expect(
    periodControl.getByRole("link", { name: "30 days" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("img", { name: /Last 30 days sales trend/i }),
  ).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Import" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Export" })).toBeDisabled();
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
  await page.goto("/app/demo/customers");
  await expect(
    page.getByRole("heading", { name: "Customers", exact: true }),
  ).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) >= 768)
    await expect(page.getByRole("table")).toBeVisible();
  else
    await expect(
      page.getByRole("button", { name: "Edit Mira Cole" }),
    ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "New customer" }),
  ).toBeDisabled();
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
  await page
    .getByRole("main")
    .getByRole("link", { name: "Units", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Units of measure", exact: true }),
  ).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) >= 768)
    await expect(page.getByRole("table")).toBeVisible();
  else
    await expect(
      page.getByRole("button", { name: "Edit Each" }),
    ).toBeDisabled();
  await expect(page.getByRole("button", { name: "New unit" })).toBeDisabled();
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
  await expect(
    page.getByText("Demo products are read-only.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Variants & options" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Product images" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload image" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("region", { name: "Product variants" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New variant" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add option" })).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBe(0);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("demo point of sale is responsive and honestly read-only", async ({
  page,
}) => {
  await page.goto("/app/demo/sales");
  await expect(
    page.getByRole("heading", { name: "Sales history", exact: true }),
  ).toBeVisible();
  await expect(page.locator('a[aria-current="page"]')).toHaveCount(1);
  await expect(page.locator('a[aria-current="page"]')).toHaveAttribute(
    "href",
    "/app/demo/sales",
  );
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBe(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.goto("/app/demo/sales/new");
  await expect(
    page.getByRole("heading", { name: "New sale", exact: true }),
  ).toBeVisible();
  await expect(page.locator('a[aria-current="page"]')).toHaveCount(1);
  await expect(page.locator('a[aria-current="page"]')).toHaveAttribute(
    "href",
    "/app/demo/sales/new",
  );
  await page.getByRole("button", { name: "Add Counter Kit" }).click();
  await expect(page.getByText("Current sale", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fill remaining total" }).click();
  await expect(page.getByLabel("Payment amount 1")).not.toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Complete sale" }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBe(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("demo sales reporting is responsive and returns-aware", async ({
  page,
}) => {
  await page.goto("/app/demo/reports/sales");
  await expect(
    page.getByRole("heading", { name: "Sales performance", exact: true }),
  ).toBeVisible();
  await expect(page.locator('a[aria-current="page"]')).toHaveCount(1);
  await expect(page.locator('a[aria-current="page"]')).toHaveAttribute(
    "href",
    "/app/demo/reports/sales",
  );
  const summary = page.getByLabel("Sales report summary");
  await expect(summary.getByText("Gross sales", { exact: true })).toBeVisible();
  await expect(summary.getByText("Net sales", { exact: true })).toBeVisible();
  await expect(page.getByText("Refund method mix")).toBeVisible();
  await expect(page.getByText("Product contribution")).toBeVisible();
  await page.getByRole("button", { name: "7 days" }).click();
  await expect(page).toHaveURL(/range=7d/);
  await page.getByLabel("Report store").selectOption("demo-west");
  await expect(page).toHaveURL(/store=demo-west/);
  await expect(
    page.locator("p:visible", { hasText: /^West Harbor$/ }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBe(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
