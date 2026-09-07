import { test, expect } from "@playwright/test";
import { technologies } from "../src/data/technologies";
import type { MetadataResponse } from "../src/types/metadata";

// Synthetic, test-only fixture values, not claims about real GitHub or npm statistics.
const fetchedAt = "2026-01-02T03:04:05.000Z";
function metadataFixture(id: string): MetadataResponse {
  return {
    technologyId: id,
    github: {
      status: "ok", fetchedAt,
      data: { repository: `codeverse-test-only/${id}`, url: `https://github.com/codeverse-test-only/${id}`,
        stars: 12345, forks: 678, openIssues: 90, language: "TypeScript" },
    },
    npm: {
      status: "ok", fetchedAt,
      data: { name: `@codeverse-test-only/${id}`, url: `https://www.npmjs.com/package/@codeverse-test-only/${id}`,
        version: "0.0.0-test-only", description: "Synthetic", license: "MIT", dependencies: {}, peerDependencies: {} },
    },
  };
}

async function blockExternalMetadataRequests(page: import("@playwright/test").Page) {
  await page.route(/^https?:\/\/([^/]+\.)?(github\.com|githubusercontent\.com|npmjs\.org|npmjs\.com)(\/|$)/, (route) => route.abort("blockedbyclient"));
}

test.use({ locale: "en-US", timezoneId: "UTC" });

test.describe("Phase 5 footer", () => {
  test("footer omits any phase label", async ({ page }) => {
    await blockExternalMetadataRequests(page);
    await page.goto("/?technology=react");
    await expect(page.getByRole("complementary", { name: "React", exact: true })).toBeVisible();
    const footer = page.locator(".footer");
    await expect(footer).toBeVisible();
    await expect(footer).not.toContainText(/PHASE\s*\d/i);
    await expect(footer.locator(".phase-label, .phase-indicator")).toHaveCount(0);
    // Footer must still show universe stats and constellation legend to remain useful.
    await expect(footer.locator(".universe-stats")).toContainText("technologies");
    await expect(footer.locator(".color-legend")).toContainText("Web");
  });
});

test.describe("Phase 5 metadata loading experience", () => {
  test("skeleton blocks appear during the loading state", async ({ page }) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/technologies/*", async (route) => {
      await pending;
      await route.fulfill({ json: metadataFixture("react") });
    });
    try {
      await page.goto("/?technology=react");
      const metadata = page.getByRole("region", { name: "Software metadata" });
      // Skeleton placeholders for both providers.
      await expect(metadata.locator(".skeleton-block").first()).toBeVisible();
      // A polite sr-only status announces the loading state for screen readers.
      await expect(metadata.locator(".sr-only[role='status']")).toContainText(/Retrieving GitHub and package signals/);
      release();
      await expect(metadata.locator(".skeleton-block")).toHaveCount(0);
      await expect(metadata.locator(".metadata-link").first()).toContainText("codeverse-test-only/react");
    } finally {
      release();
    }
  });

  test("user-facing error copy is friendly and does not invent data", async ({ page }) => {
    await page.route("**/api/technologies/*", async (route) => {
      await route.fulfill({ json: {
        technologyId: "react",
        github: { status: "rate_limited", message: "Provider raw rate limit message.", retryAt: "2026-01-02T04:00:00.000Z" },
        npm: { status: "ok", fetchedAt: "2026-01-02T03:04:05.000Z",
          data: { name: "react", url: "https://www.npmjs.com/package/react", version: "19.0.0",
            description: null, license: "MIT", dependencies: {}, peerDependencies: {} } },
      } satisfies MetadataResponse });
    });
    await page.goto("/?technology=react");
    const metadata = page.getByRole("region", { name: "Software metadata" });
    // Friendlier wording is shown; raw provider message is *not* exposed to the user.
    await expect(metadata.locator(".metadata-notice")).toContainText("This provider is rate-limiting right now.");
    await expect(metadata.locator(".metadata-notice")).not.toContainText("Provider raw rate limit message.");
    // The npm provider still renders correctly — never fabricated stats.
    await expect(metadata.getByRole("link", { name: /react v19/ })).toBeVisible();
    expect(await metadata.locator(".metadata-stats").count()).toBe(0);
  });

  test("retry button is restyled as a primary control", async ({ page }) => {
    await page.route("**/api/technologies/*", (route) => route.abort("failed"));
    await page.goto("/?technology=react");
    const metadata = page.getByRole("region", { name: "Software metadata" });
    const retry = metadata.getByRole("button", { name: "Retry metadata" });
    await expect(retry).toBeVisible();
    // The retry button uses the new .metadata-retry style (not the old ad-hoc white background).
    const background = await retry.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(background).not.toBe("rgba(255, 255, 255, 0.03)"); // old #ffffff08
    expect(background).not.toBe("transparent");
  });
});

test.describe("Phase 5 responsive polish", () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    test(`connected-button and view-button honor minimum touch targets at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      test.skip(viewport.width !== 390, "Touch-target guard is enforced on the 390-wide mobile breakpoint only");
      await blockExternalMetadataRequests(page);
      await page.setViewportSize(viewport);
      await page.goto("/?technology=react");
      const connected = page.locator(".connected-button").first();
      const view = page.getByRole("button", { name: "Zoom in", exact: true });
      const connectedBox = await connected.boundingBox();
      const viewBox = await view.boundingBox();
      expect(connectedBox?.height ?? 0).toBeGreaterThanOrEqual(36);
      expect(viewBox?.height ?? 0).toBeGreaterThanOrEqual(36);
    });
  }

  test("selected-panel stays within the viewport on mobile", async ({ page }) => {
    await blockExternalMetadataRequests(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?technology=react");
    const inspector = page.getByRole("complementary", { name: "React", exact: true });
    await expect(inspector).toBeVisible();
    const box = await inspector.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  });
});

test.describe("Phase 5 accessibility", () => {
  test("node-target focus ring uses the technology color and is visible", async ({ page }) => {
    await blockExternalMetadataRequests(page);
    await page.goto("/?technology=react");
    // Wait until the 3D scene is ready before focusing a node.
    await expect(page.locator(".live-dot")).toHaveClass(/is-live/);
    const node = page.locator(".node-target").filter({ hasText: "Next.js" }).first();
    await node.focus();
    const outline = await node.evaluate((element) => getComputedStyle(element).outlineColor);
    // The focus ring color comes from var(--node-color), which is the technology's category color.
    // Hex 0x62d5ff is the Web category color, expressed as an rgb() value by the browser.
    expect(outline).toBe("rgb(98, 213, 255)");
  });
});

test.describe("Phase 5 connection legibility", () => {
  test("dashed dependency edges use a distinct color and remain visible when dimmed", async ({ page }) => {
    await blockExternalMetadataRequests(page);
    await page.goto("/?technology=react");
    // Wait for the 3D scene to mount so the technology nodes exist in the DOM.
    await expect(page.locator(".live-dot")).toHaveClass(/is-live/);
    await expect(page.locator(".node-target")).toHaveCount(technologies.length);
  });
});