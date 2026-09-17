import { expect, test } from "@playwright/test";

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

  test("service worker keeps the field shell after going offline", async ({ page, context }) => {
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

    await page.goto("/field");
    await expect(page.getByRole("heading", { name: "Today's runs" })).toBeVisible();

    await context.setOffline(true);
    const response = await page.goto("/field", { waitUntil: "domcontentloaded" });
    expect(response).not.toBeNull();
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today's runs" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download for offline" })).toBeVisible();
  });
});
