import { test, expect } from "@playwright/test";

// Browser-only fixtures: these tests never write to the real API or database.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const user = { id: "motion-test", name: "Teste Visual", email: "motion@example.test", role: "ADMIN", is_active: true, must_change_password: false };
    const accounts = Array.from({ length: 12 }, (_, i) => ({ id: String(i), account_number: String(i), nickname: `Mesa ${i + 1}`, status: "ACTIVE", initial_capital: "15000", balance: "15500", result: "500", paid: "0", return_pct: "3.33", drawdown: "0", pending_months: [], is_active: true }));
    const data = path === "/api/auth/login" ? { user, state: "OK" }
      : path === "/api/auth/me" ? user
      : path === "/api/accounts" ? accounts
      : path === "/api/dashboard" ? { summary: { capital: "180000", balance: "186000", result: "6000", paid: "0", return_pct: "3.33", drawdown: "0", account_count: 12, unconfigured_count: 0 }, accounts, evolution: [], monthly: [] }
      : null;
    await route.fulfill({ json: data });
  });
});

test("login transitions only after success and reveals cards on scroll", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await page.locator("#email").fill("motion@example.test");
  await page.locator("#password").fill("test-only-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator(".login-arrival")).toBeVisible();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.locator(".account-card")).toHaveCount(12);
  const last = page.locator(".account-card").last();
  await last.scrollIntoViewIfNeeded();
  await expect.poll(() => last.evaluate((element) => element.getAnimations().length)).toBeGreaterThan(0);
  await expect.poll(() => last.evaluate((element) => element.getAnimations().length)).toBe(0);
  await expect(last).toBeVisible();
  await page.screenshot({ path: "../.local/motion-dashboard.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("failed login stays usable without success transition", async ({ page }) => {
  await page.route("**/api/auth/login", (route) => route.fulfill({ status: 401, json: { detail: "Credenciais inválidas." } }));
  await page.goto("/login");
  await page.locator("#email").fill("motion@example.test");
  await page.locator("#password").fill("invalid-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Credenciais inválidas.")).toBeVisible();
  await expect(page.locator(".login-arrival")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();
});

test("mobile reduced motion shows content without reveal animations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard");
  const last = page.locator(".account-card").last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeVisible();
  expect(await last.evaluate((element) => element.getAnimations().length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("cinematic opening unfolds wings and clears by two seconds", async ({ page }) => {
  await page.goto("/login");
  const intro = page.locator(".cinema-intro");
  await expect(intro).toHaveCount(1);
  const frame = async (time: number) => page.evaluate((at) => {
    document.querySelectorAll(".cinema-intro, .cinema-intro *").forEach((element) => {
      element.getAnimations().forEach((animation) => { animation.pause(); animation.currentTime = at; });
    });
  }, time);
  await frame(0);
  await expect(intro).toHaveCSS("opacity", "1");
  const folded = await page.locator(".cinema-wing-left").evaluate((e) => getComputedStyle(e).transform);
  await frame(1050);
  const unfolded = await page.locator(".cinema-wing-left").evaluate((e) => getComputedStyle(e).transform);
  expect(folded).not.toBe(unfolded);
  await page.screenshot({ path: "../.local/cinema-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "../.local/cinema-mobile.png" });
  await frame(2000);
  await expect(intro).toHaveCSS("visibility", "hidden");
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(intro).toHaveCSS("display", "none");
});
