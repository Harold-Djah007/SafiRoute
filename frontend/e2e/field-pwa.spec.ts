import { expect, test } from "@playwright/test";

const FIELD_USER = {
  id: 42,
  username: "driver-ci",
  first_name: "Field",
  last_name: "Driver",
  full_name: "Field Driver",
  email: "",
  role: "driver",
  role_display: "Driver",
  phone: "",
  employee_id: "CI-DRIVER",
  branch: "Accra",
};

test.describe("installable field PWA", () => {
  test("manifest is a standalone field app", async ({ request }) => {
    const res = await request.get("/manifest.json");
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toContain("/field");
    expect(manifest.theme_color).toBe("#0F5C2E");
    expect(manifest.icons?.length).toBeGreaterThan(0);
  });

  test("sign-in shell renders without Django", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByRole("button", { name: /Enter dashboard|Open field app/ })).toBeVisible();
  });

  test("service worker keeps an authenticated field shell after going offline", async ({ page, context }) => {
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
    }, FIELD_USER);

    await page.goto("/field");
    await expect(page.getByRole("heading", { name: "Today's runs" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download for offline" })).toBeVisible();

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Today's runs" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download for offline" })).toBeVisible();
    await expect(page.getByText("No signal — deliveries save on this phone and send when 4G returns.")).toBeVisible();
    await expect(page.getByText("Could not reach SafiRoute. Showing last downloaded runs.")).toBeVisible();
  });
});
