import { expect, test } from "@playwright/test";

const SALES_USER = {
  id: 42,
  username: "sales-ci",
  first_name: "Ama",
  last_name: "Mensah",
  full_name: "Ama Mensah",
  email: "",
  role: "sales",
  role_display: "Sales User",
  phone: "",
  employee_id: "CI-SALES",
  branch: "Ashaiman Plant",
};

test.describe("installable SafiRoute Sales PWA", () => {
  test("manifest is a standalone Sales waybill app", async ({ request }) => {
    const res = await request.get("/manifest.json");
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/field");
    expect(manifest.name).toContain("Sales Waybill");
    expect(manifest.theme_color).toBe("#0F5C2E");
    expect(manifest.icons?.length).toBeGreaterThan(0);
  });

  test("sign-in shell presents Sales as the mobile experience", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByText("Sales user")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open SafiRoute" })).toBeVisible();
  });

  test("website no longer presents retired operational roles", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Sales user")).toBeVisible();
    await expect(page.getByText("Sales administrator")).toBeVisible();
    await expect(page.getByText(/warehouse/i)).toHaveCount(0);
    await expect(page.getByText(/driver/i)).toHaveCount(0);
    await expect(page.getByText(/finance/i)).toHaveCount(0);
    await expect(page.getByText(/supervisor/i)).toHaveCount(0);
  });

  test("Sales waybill home and animation render without Django", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((user) => {
      sessionStorage.setItem("safiroute_user", JSON.stringify(user));
    }, SALES_USER);

    await page.goto("/field");
    await expect(page.getByRole("link", { name: /New waybill Start a customer delivery/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Saved waybills" })).toBeVisible();
    await expect(page.getByText("Sale → signed → verified")).toBeVisible();
    await expect(page.getByText("Your digital pad is ready")).toBeVisible();
    await expect(page.getByText("Today's runs")).toHaveCount(0);
  });

  test("new waybill mirrors the simple Safisana paper form", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((user) => {
      sessionStorage.setItem("safiroute_user", JSON.stringify(user));
    }, SALES_USER);

    await page.goto("/field/new");
    await expect(page.getByLabel("Deliver to:")).toBeVisible();
    await expect(page.getByLabel("Delivery Contact Name:")).toBeVisible();
    await expect(page.getByLabel("Contact Phone:")).toBeVisible();
    await expect(page.getByLabel("Address:")).toBeVisible();
    await expect(page.getByText("Description", { exact: true })).toBeVisible();
    await expect(page.getByText("Remarks", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Authorised by:")).toBeVisible();
    await expect(page.getByLabel("Dispatched by:")).toBeVisible();
    await expect(page.getByLabel("Received by:")).toBeVisible();
    await expect(page.getByText("Digital proof")).toBeVisible();
    await expect(page.getByText("Vehicle registration")).toHaveCount(0);
    await expect(page.getByText("Driver")).toHaveCount(0);
  });

  test("service worker keeps the Sales waybill shell available offline", async ({ page, context }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    await expect
      .poll(async () =>
        page.evaluate(async () => {
          if (!("serviceWorker" in navigator)) return "unsupported";
          const reg = await navigator.serviceWorker.ready;
          return reg.active ? "active" : "missing";
        })
      )
      .toBe("active");

    await page.evaluate((user) => {
      sessionStorage.setItem("safiroute_user", JSON.stringify(user));
    }, SALES_USER);

    await page.goto("/field");
    await expect(page.getByRole("heading", { name: "Saved waybills" })).toBeVisible();

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Saved waybills" })).toBeVisible();
    await expect(page.getByText("No signal — keep working. SafiRoute is saving this waybill on the phone.")).toBeVisible();
    await expect(page.getByRole("link", { name: /New waybill Start a customer delivery/ })).toBeVisible();
  });
});
