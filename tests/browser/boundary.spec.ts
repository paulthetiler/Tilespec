import { expect, test } from "@playwright/test";

test("public TileSPEC website remains accessible and its enquiry wording is preserved", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: "TileSPEC Commercial Tiling" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "PREPARE EMAIL ENQUIRY" })).toBeVisible();
  await expect(page.getByText("No information is submitted until you send the email.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
test("phone navigation responds to taps", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Touch menu is a mobile control.");
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Close menu" }).click();
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
});
test("unconfigured login is usable on a phone and never invents accounts", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByText("backend needs configuration", { exact: false })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email address" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
test("anonymous visitors cannot receive any estimator pricing or contract HTML", async ({ page, request }) => {
  for (const path of ["/admin", "/admin/estimator", "/admin/contracts", "/admin/team", "/admin/documents/11111111-1111-4111-8111-111111111111"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect([303, 307, 308]).toContain(response.status());
    expect(response.headers().location).toContain("/login");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.text()).not.toContain("£17,500");
  }
  await page.goto("/admin/estimator");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Commercial tender estimator" })).toHaveCount(0);
});
test("password setup requires a real authenticated session and malformed invitations fail closed", async ({ request }) => {
  for (const path of ["/auth/set-password", "/auth/confirm?type=signup&token_hash=untrusted"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect([303, 307, 308]).toContain(response.status());
    expect(response.headers().location).toContain("/login");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    expect(await response.text()).not.toContain("untrusted");
  }
});
