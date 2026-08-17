import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.setTimeout(120_000);

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
  await page.getByRole("button", { name: "Open global search" }).click();
  const globalSearch = page.getByRole("combobox", {
    name: "Search products, people, or settings",
  });
  await globalSearch.fill("product");
  await expect(
    page.getByRole("link", { name: /Product catalog/i }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const categoryFilter = page.getByRole("combobox", { name: "Category" });
  await categoryFilter.click();
  await expect(
    page.getByRole("option", { name: "All categories" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
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
  const reportStore = page.getByLabel("Report store");
  await expect(reportStore).toBeEnabled();
  await reportStore.click();
  await page.getByRole("option", { name: "West Harbor · WH" }).click();
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

test("demo workforce and payroll are responsive and access-honest", async ({
  page,
}) => {
  await page.goto("/app/demo/employees");
  await expect(
    page.getByRole("heading", { name: "Employees", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("General employee records exclude compensation values"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New employee" }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "Attendance", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Attendance", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record attendance" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Leave", exact: true }).last().click();
  await expect(
    page.getByRole("heading", { name: "Leave", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request leave" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Payroll", exact: true }).last().click();
  await expect(
    page.getByRole("heading", { name: "Payroll", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Operational payroll only.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Prepare payroll" }),
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

test("demo purchasing and expenses are responsive and state-aware", async ({
  page,
}) => {
  await page.goto("/app/demo/suppliers");
  await expect(
    page.getByRole("heading", { name: "Suppliers", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New supplier" }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "Purchases", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Purchase orders", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("PO-000314", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New purchase order" }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "Expenses", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Expenses", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("EXP-000481", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New expense" }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "Operations report", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Purchasing & expenses", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Operations report summary")).toBeVisible();
  await page.getByRole("button", { name: "30 days" }).click();
  await expect(page).toHaveURL(/range=30d/);
  const operationsStore = page.getByRole("combobox", {
    name: "Operations report store",
  });
  await operationsStore.click();
  await page.getByRole("option", { name: "West Harbor" }).click();
  await expect(page).toHaveURL(/store=demo-west/);
  await expect(
    page.getByText(/not a statutory accounting statement/i),
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

test("demo settings, notifications, and governance are responsive", async ({
  page,
}) => {
  await page.goto("/app/demo/settings/business");
  await expect(
    page.getByRole("heading", {
      name: "Business profile",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save business profile" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Stores", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Stores", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "New store" })).toBeDisabled();
  await page
    .getByRole("link", { name: "Security & data", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Security, integrations and data",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Account security mutations are disabled in the public demo.",
    ),
  ).toBeVisible();
  await page.goto("/app/demo/notifications");
  await expect(
    page.getByRole("heading", { name: "Notifications", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Low stock requires attention")).toBeVisible();
  await page.goto("/app/demo/audit-log");
  await expect(
    page.getByRole("heading", { name: "Audit log", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Advanced audit requires Business"),
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

test("public legal placeholders are explicit and accessible", async ({
  page,
}) => {
  for (const path of ["/privacy", "/terms"]) {
    await page.goto(path);
    await expect(page.getByText("Legal review required")).toBeVisible();
    await expect(page.getByText(/implementation placeholder/i)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});
