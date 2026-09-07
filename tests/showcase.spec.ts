import { test, expect } from "@playwright/test";

// Phase 6 ship-readiness tests.
// These are lightweight smoke checks that verify the public surface of the app:
// 1. No Phase / version labels are exposed to users.
// 2. Page metadata is professional and present.
// 3. The favicon (generated from src/app/icon.tsx) is reachable.
// 4. Hardening headers are sent by the Next.js / Vercel edge.

test.describe("Phase 6 ship readiness", () => {
  test("page title is professional", async ({ page }) => {
    await page.goto("/");
    const title = await page.title();
    expect(title).toBe("CODEVERSE — Navigate the universe of software");
  });

  test("Open Graph and Twitter metadata are present", async ({ page }) => {
    await page.goto("/");
    const ogTitle = await page.locator('meta[property="og:title"]').first().getAttribute("content");
    const ogDescription = await page.locator('meta[property="og:description"]').first().getAttribute("content");
    const ogType = await page.locator('meta[property="og:type"]').first().getAttribute("content");
    const ogSiteName = await page.locator('meta[property="og:site_name"]').first().getAttribute("content");
    const twitterCard = await page.locator('meta[name="twitter:card"]').first().getAttribute("content");
    expect(ogTitle).toContain("CODEVERSE");
    expect(ogDescription).not.toBeNull();
    expect(ogDescription?.length ?? 0).toBeGreaterThan(20);
    expect(ogType).toBe("website");
    expect(ogSiteName).toBe("CODEVERSE");
    expect(twitterCard).toBe("summary_large_image");
  });

  test("meta description is accurate and non-empty", async ({ page }) => {
    await page.goto("/");
    const description = await page.locator('meta[name="description"]').first().getAttribute("content");
    expect(description).not.toBeNull();
    expect(description?.length ?? 0).toBeGreaterThan(40);
    // The description should describe what the app does.
    expect(description?.toLowerCase()).toMatch(/atlas|ecosystem|technology|software|dependency|npm|github/);
  });

  test("favicon is served by the Next.js icon route", async ({ request }) => {
    const response = await request.get("/icon");
    expect(response.status()).toBe(200);
    const contentType = response.headers()["content-type"];
    expect(contentType).toMatch(/image\//);
    // A 32x32 icon is small; confirm the body is non-trivial.
    const body = await response.body();
    expect(body.length).toBeGreaterThan(64);
  });

  test("viewport theme color and dark color scheme are advertised", async ({ page }) => {
    await page.goto("/");
    const themeColor = await page.locator('meta[name="theme-color"]').first().getAttribute("content");
    const colorScheme = await page.locator('meta[name="color-scheme"]').first().getAttribute("content");
    expect(themeColor).toBe("#060910");
    expect(colorScheme).toBe("dark");
  });

  test("topbar never exposes Phase 0X-style version indicators", async ({ page }) => {
    await page.goto("/");
    const topbar = page.locator(".topbar");
    await expect(topbar).toBeVisible();
    await expect(topbar).not.toContainText(/EXPLORER\s*\/\s*0\d/);
    await expect(topbar).not.toContainText(/PHASE\s*\d/i);
    await expect(topbar.locator(".phase-label, .phase-indicator")).toHaveCount(0);
  });

  test("footer never exposes Phase 0X-style version indicators", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator(".footer");
    await expect(footer).toBeVisible();
    await expect(footer).not.toContainText(/PHASE\s*\d/i);
    await expect(footer.locator(".phase-label, .phase-indicator")).toHaveCount(0);
  });

  test("no client-side HTML contains dangerouslySetInnerHTML or eval", async ({ page }) => {
    await page.goto("/");
    // The Next.js dev-mode error overlay legitimately uses dangerouslySetInnerHTML for its
    // own injected CSS; only assert the absence of these tokens in our own markup.
    const mainHtml = await page.locator("main").innerHTML();
    expect(mainHtml).not.toContain("dangerouslySetInnerHTML");
    expect(mainHtml.toLowerCase()).not.toMatch(/\beval\s*\(/);
  });
});

test.describe("Phase 6 hardening headers", () => {
  // These headers are declared in vercel.json and should appear on every response.
  for (const header of ["x-content-type-options", "referrer-policy", "x-frame-options", "permissions-policy"]) {
    test(`response sets ${header}`, async ({ request }) => {
      const response = await request.get("/");
      expect(response.status()).toBe(200);
      const value = response.headers()[header];
      expect(value).toBeDefined();
      expect(value?.length ?? 0).toBeGreaterThan(0);
    });
  }
});

test.describe("Phase 6 catalog provenance labels", () => {
  test("local fallback is honestly labeled", async ({ page }) => {
    await page.goto("/?technology=react");
    const edition = page.locator(".edition-label");
    await expect(edition).toBeVisible();
    // The state label (LOCAL / CONNECTED / CACHED) is the only "phase-like" hint we expose.
    expect(await edition.textContent()).toMatch(/LOCAL|CONNECTED|CACHED/);
  });
});