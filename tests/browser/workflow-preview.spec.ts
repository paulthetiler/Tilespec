import { expect, test } from "@playwright/test";

// Exercise the actual Next rewrites and copied assets. file:// prototype tests
// cannot detect a broken base URL on the deployed preview.
for (const pathname of ["/preview/workflow", "/preview/workflow/"]) {
  test(`workflow preview loads its shared engine at ${pathname}`, async ({ page }) => {
    const errors: string[] = [];
    const scripts: { pathname: string; status: number }[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => {
      const url = new URL(response.url());
      if (url.pathname.startsWith("/preview/") && url.pathname.endsWith(".js")) {
        scripts.push({ pathname: url.pathname, status: response.status() });
      }
    });

    const response = await page.goto(`${pathname}?role=u-dave&device=mobile#/today`);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    await expect(page.getByText("Fictional data. Nothing is saved anywhere.")).toBeVisible();
    await expect(page.locator(".hero h2")).toHaveText("Do the morning checks");
    expect(scripts.map(script => script.pathname).sort()).toEqual([
      "data.js", "engine.js", "preview-engine.js", "ui.js", "screens-site.js", "screens-office.js",
    ].map(name => `/preview/workflow/${name}`).sort());
    expect(scripts.every(script => script.status === 200)).toBe(true);

    await page.locator("#device").getByRole("button", { name: "Report an issue" }).click();
    await expect(page.locator("#device").getByText("Does work need to stop here?")).toBeVisible();
    expect(errors).toEqual([]);
    expect(await page.locator("#device").evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  });
}
