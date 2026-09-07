import { test as base, expect, type Locator, type Page, type Route } from "@playwright/test";
import { getConnectedIds, technologies, technologyById } from "../src/data/technologies";
import { searchTechnologies } from "../src/lib/search";
import type { MetadataResponse } from "../src/types/metadata";

// Synthetic, test-only values, not claims about real GitHub or npm statistics.
const fetchedAt = "2026-01-02T03:04:05.000Z";
function metadataFixture(id: string): MetadataResponse {
  return {
    technologyId: id,
    github: {
      status: "ok", fetchedAt,
      data: {
        repository: `codeverse-test-only/${id}`,
        url: `https://github.com/codeverse-test-only/${id}`,
        stars: 12345, forks: 678, openIssues: 90, language: "TypeScript",
      },
    },
    npm: {
      status: "ok", fetchedAt,
      data: {
        name: `@codeverse-test-only/${id}`,
        url: `https://www.npmjs.com/package/@codeverse-test-only/${id}`,
        version: "0.0.0-test-only", description: "Synthetic Playwright package fixture",
        license: "MIT",
        dependencies: { "test-only-runtime": "^1.2.3", "test-only-helper": "~4.5.6" },
        peerDependencies: { "test-only-host": ">=7 <9" },
      },
    },
  };
}

type MetadataMock = {
  requests: string[];
  respond: (id: string, route: Route) => Promise<void>;
};

const test = base.extend<{ metadataMock: MetadataMock }>({
  metadataMock: async ({ context }, provide) => {
    const mock: MetadataMock = {
      requests: [],
      respond: async (id, route) => { await route.fulfill({ json: metadataFixture(id) }); },
    };
    const externalRequests: string[] = [];
    // Mock the browser/server boundary so the server never calls real providers.
    await context.route("**/api/technologies/*", async (route) => {
      const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop()!);
      mock.requests.push(id);
      await mock.respond(id, route);
    });
    // Also reject accidental direct browser calls to external metadata providers.
    await context.route(/^https?:\/\/([^/]+\.)?(github\.com|githubusercontent\.com|npmjs\.org|npmjs\.com)(\/|$)/, async (route) => {
      externalRequests.push(route.request().url());
      await route.abort("blockedbyclient");
    });
    await provide(mock);
    expect(externalRequests, "Metadata must use the intercepted application API").toEqual([]);
  },
  page: async ({ page, metadataMock }, provide) => {
    void metadataMock;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await provide(page);
  },
});

test.use({ locale: "en-US", timezoneId: "UTC" });

async function selectFromSearch(page: Page, query: string, id: string) {
  const input = page.getByRole("combobox", { name: "Search technologies" });
  await input.fill(query);
  await expect(page.getByRole("option").first()).toContainText(technologyById[id].name);
  await input.press("Enter");
  await expect(page).toHaveURL((url) => url.searchParams.get("technology") === id);
  await expect(page.locator(".selected-title")).toHaveText(technologyById[id].name);
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("aria-expanded", "false");
}

async function expectBounded(locator: Locator, width: number, height: number) {
  await expect(locator).toBeVisible();
  await expect.poll(async () => {
    const box = await locator.boundingBox();
    return !!box && box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0
      && box.x + box.width <= width + 1 && box.y + box.height <= height + 1;
  }, { message: "Element should remain within the viewport" }).toBe(true);
}

test.describe("pure technology search (no browser)", () => {
  test("exact names and IDs rank first, with case and punctuation normalization", () => {
    for (const technology of technologies) {
      for (const query of [technology.id, technology.name, `  ${technology.name.toUpperCase()}  `]) {
        expect(searchTechnologies(query)[0]?.id, query).toBe(technology.id);
      }
    }
    const matches = searchTechnologies("go").map(({ id }) => id);
    expect(matches[0]).toBe("go");
    expect(matches).toContain("django");
    expect(matches).toContain("mongodb");
  });

  test("partial names rank ahead of description matches", () => {
    expect(searchTechnologies("py")[0]?.id).toBe("pytorch");
    expect(searchTechnologies("py").map(({ id }) => id)).toEqual(expect.arrayContaining(["fastapi", "django"]));
    expect(searchTechnologies("gres").map(({ id }) => id)).toEqual(["postgresql", "vue"]);
    expect(searchTechnologies("sorflow")[0]?.id).toBe("tensorflow");
  });

  test("aliases resolve to their intended technology", () => {
    const cases: [string, string[]][] = [
      ["react", ["reactjs", "react.js"]], ["nextjs", ["next", "next js"]],
      ["vue", ["vuejs", "vue.js"]], ["angular", ["@angular/core"]],
      ["nodejs", ["node", "node js", "javascript runtime"]], ["fastapi", ["fast api"]],
      ["go", ["golang"]], ["postgresql", ["postgres", "psql"]], ["mongodb", ["mongo"]],
      ["pytorch", ["torch"]], ["tensorflow", ["tf", "tensorflowjs"]],
      ["huggingface", ["hugging face", "hf", "transformers"]],
    ];
    for (const [id, queries] of cases) {
      for (const query of queries) expect(searchTechnologies(query)[0]?.id, query).toBe(id);
    }
  });

  test("categories, labels, subtitles, descriptions and details are searchable", () => {
    for (const category of ["Web", "Backend", "Database", "AI"] as const) {
      const expected = technologies.filter((technology) => technology.category === category).map(({ id }) => id);
      expect(searchTechnologies(category).map(({ id }) => id)).toEqual(expect.arrayContaining(expected));
    }
    for (const query of ["AI & ML", "artificial intelligence", "intelligence discovery"]) {
      expect(searchTechnologies(query).map(({ id }) => id)).toEqual(["pytorch", "tensorflow", "jax", "huggingface"]);
    }
    expect(searchTechnologies("data persistence").map(({ id }) => id)).toEqual(["postgresql", "mongodb", "redis", "mysql"]);
    expect(searchTechnologies("native interfaces").map(({ id }) => id)).toEqual(["react"]);
    expect(searchTechnologies("perfectionists deadlines").map(({ id }) => id)).toEqual(["django"]);
    expect(searchTechnologies("automatic differentiation").map(({ id }) => id)).toEqual(["jax"]);
  });

  test("blank queries preserve catalog order and unmatched queries return no results", () => {
    for (const query of ["", "   ", "... / @"]) expect(searchTechnologies(query)).toEqual(technologies);
    for (const query of ["zzzz-test-only-no-signal", "react zzzz-no-signal", "constructor", "__proto__"]) {
      expect(searchTechnologies(query), query).toEqual([]);
    }
  });
});

test("keyboard navigation wraps, Enter selects, and search Escape preserves selection", async ({ page }) => {
  await page.goto("/?technology=react");
  await expect(page.locator(".selected-title")).toHaveText("React");
  await page.keyboard.press("/");
  const input = page.getByRole("combobox", { name: "Search technologies" });
  const options = page.getByRole("option");
  await expect(input).toBeFocused();
  await expect(options).toHaveCount(technologies.length);
  await expect(input).toHaveAttribute("aria-activedescendant", "search-option-0");
  await input.press("ArrowUp");
  await expect(options.last()).toHaveAttribute("aria-selected", "true");
  await expect(input).toHaveAttribute("aria-activedescendant", `search-option-${technologies.length - 1}`);
  await input.press("ArrowDown");
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(options.first()).toHaveAttribute("aria-selected", "false");
  await input.press("ArrowUp");
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(page).toHaveURL(/\?technology=nextjs$/);
  await expect(page.locator(".selected-title")).toHaveText("Next.js");
  await expect(input).toHaveValue("");
  await expect(input).not.toBeFocused();
  await input.fill("golang");
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await input.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);
  await expect(input).not.toBeFocused();
  await expect(page).toHaveURL(/\?technology=nextjs$/);
  await expect(page.locator(".selected-title")).toHaveText("Next.js");
});

test("empty search results tolerate navigation and Enter without changing selection", async ({ page, metadataMock }) => {
  await page.goto("/?technology=react");
  await expect(page.locator(".metadata-link").first()).toContainText("codeverse-test-only/react");
  const input = page.getByRole("combobox", { name: "Search technologies" });
  await input.fill("zzzz-test-only-no-signal");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(page.locator(".search-empty")).toContainText("No signals found.");
  await expect(page.locator(".search-empty")).toContainText("Try a name, alias, category, or description.");
  await input.press("ArrowDown");
  await input.press("ArrowUp");
  await input.press("Enter");
  await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);
  await expect(page).toHaveURL(/\?technology=react$/);
  await expect(page.locator(".selected-title")).toHaveText("React");
  expect(metadataMock.requests).toEqual(["react"]);
});

test("direct URL focuses the highlighted node and its curated neighbors", async ({ page }) => {
  await page.goto("/?technology=react");
  await expect(page.locator(".live-dot")).toHaveClass(/is-live/);
  const react = page.locator('.node-target[aria-label="Explore React, Web"]');
  await expect(react).toHaveAttribute("aria-pressed", "true");
  await expect(react).toHaveClass(/is-emphasized/);
  await expect(react.locator(".node-category")).toHaveText("IN FOCUS");
  await expect(page.locator('.node-target[aria-pressed="true"]')).toHaveCount(1);
  const neighbors = getConnectedIds("react");
  await expect(page.locator(".connection-count")).toHaveText(String(neighbors.length));
  await expect(page.locator(".connected-button")).toHaveCount(neighbors.length);
  await expect(page.locator(".node-target.is-connected")).toHaveCount(neighbors.length);
  await expect(page.locator(".node-target.is-dimmed")).toHaveCount(technologies.length - neighbors.length - 1);
  for (const id of neighbors) {
    const technology = technologyById[id];
    await expect(page.locator(`.node-target[aria-label="Explore ${technology.name}, ${technology.category}"]`)).toHaveClass(/is-connected/);
  }
  await expect(page.locator(".sr-only[aria-live]")).toContainText("Focused on React.");
  const focusedPosition = await react.boundingBox();
  expect(focusedPosition).not.toBeNull();
  await page.getByRole("button", { name: "Reset view and return to universe" }).click();
  await expect(react).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => {
    const overview = await react.boundingBox();
    return overview ? Math.hypot(overview.x - focusedPosition!.x, overview.y - focusedPosition!.y) : 0;
  }, { message: "Reset should move the camera from direct-load focus to overview" }).toBeGreaterThan(20);
});

test("search, history and reset preserve URL extras and the original canvas", async ({ page }) => {
  await page.goto("/?test-only=preserved#atlas");
  await expect(page.locator(".live-dot")).toHaveClass(/is-live/);
  const canvas = await page.locator(".scene-container canvas").elementHandle();
  expect(canvas).not.toBeNull();
  const states: (string | null)[] = ["react", "nextjs", "react", null, "react", "nextjs", null, "nextjs", null];
  for (const [index, id] of states.entries()) {
    if (index === 0) await selectFromSearch(page, "reactjs", "react");
    else if (index === 1) await selectFromSearch(page, "next js", "nextjs");
    else if ([2, 3, 7].includes(index)) await page.goBack();
    else if (index === 6) await page.getByRole("button", { name: "Reset view and return to universe" }).click();
    else await page.goForward();
    await expect(page).toHaveURL((url) => url.searchParams.get("technology") === id
      && url.searchParams.get("test-only") === "preserved" && url.hash === "#atlas");
    if (id) await expect(page.locator(".selected-title")).toHaveText(technologyById[id].name);
    else {
      await expect(page.locator(".selected-panel")).toHaveCount(0);
      await expect(page.locator(".node-target.is-dimmed")).toHaveCount(0);
    }
    await expect(page.locator('.node-target[aria-pressed="true"]')).toHaveCount(id ? 1 : 0);
    expect(await canvas!.evaluate((original) => original.isConnected
      && document.querySelector(".scene-container canvas") === original)).toBe(true);
  }
  await canvas!.dispose();
});

test("history reconciles category filtering and connected navigation retains focus", async ({ page }) => {
  await page.goto("/?technology=react");
  await expect(page.locator(".selected-title")).toHaveText("React");
  await page.getByRole("button", { name: "AI & ML 4" }).click();
  await page.goBack();
  await expect(page.locator(".selected-title")).toHaveText("React");
  await expect(page.locator('.category-button[data-category="All"]')).toHaveAttribute("aria-pressed", "true");
  const next = page.locator(".connected-button").filter({ hasText: "Next.js" });
  await next.focus();
  await next.press("Enter");
  await expect(page.locator(".selected-title")).toHaveText("Next.js");
  await expect(page.locator(".selected-panel")).toBeFocused();
});

test("metadata loading resolves to typed GitHub, npm and dependency fixtures", async ({ page, metadataMock }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  metadataMock.respond = async (id, route) => {
    await pending;
    await route.fulfill({ json: metadataFixture(id) });
  };
  try {
    await page.goto("/?technology=react");
    const metadata = page.getByRole("region", { name: "Software metadata" });
    await expect(metadata.getByRole("status")).toHaveText("Retrieving GitHub and package signals...");
    await expect(metadata.getByRole("link")).toHaveCount(0);
    await expect(page.locator(".selected-description")).toHaveText(technologyById.react.description);
    release();
    await expect(metadata.locator(".metadata-loading")).toHaveCount(0);
    const github = metadata.getByRole("link", { name: /codeverse-test-only\/react/ }).first();
    await expect(github).toHaveAttribute("href", "https://github.com/codeverse-test-only/react");
    await expect(github).toHaveAttribute("target", "_blank");
    await expect(github).toHaveAttribute("rel", "noopener noreferrer");
    await expect(metadata.locator(".metadata-stats dd")).toHaveText(["12,345", "678", "90"]);
    await expect(metadata).toContainText("TypeScript / *Includes pull requests");
    const npm = metadata.locator('a[href^="https://www.npmjs.com/"]');
    await expect(npm).toHaveAttribute("href", "https://www.npmjs.com/package/@codeverse-test-only/react");
    await expect(npm).toContainText("v0.0.0-test-only");
    await expect(metadata).toContainText("License: MIT");
    const dependencies = metadata.locator("details").nth(0);
    const peers = metadata.locator("details").nth(1);
    await expect(dependencies.locator("summary")).toHaveText("Dependencies2");
    await expect(peers.locator("summary")).toHaveText("Peer dependencies1");
    await dependencies.locator("summary").click();
    await expect(dependencies.locator("li")).toHaveText(["test-only-runtime^1.2.3", "test-only-helper~4.5.6"]);
    await peers.locator("summary").click();
    await expect(peers.locator("li")).toHaveText(["test-only-host>=7 <9"]);
    await expect(metadata.locator(".metadata-fetched")).toHaveText([
      "Retrieved 1/2/2026, 3:04:05 AM", "Retrieved 1/2/2026, 3:04:05 AM",
    ]);
    expect(metadataMock.requests).toEqual(["react"]);
  } finally {
    release();
  }
});

test("partial rate limiting preserves npm and curated fallback details", async ({ page, metadataMock }) => {
  metadataMock.respond = async (id, route) => {
    const data = metadataFixture(id);
    data.github = { status: "rate_limited", message: "Test-only GitHub rate limit reached.", retryAt: "2026-01-02T04:00:00.000Z" };
    await route.fulfill({ json: data });
  };
  await page.goto("/?technology=react");
  const metadata = page.getByRole("region", { name: "Software metadata" });
  await expect(metadata.getByRole("status")).toContainText("Test-only GitHub rate limit reached.");
  await expect(metadata.getByRole("status")).toContainText("Retry after 4:00:00 AM.");
  await expect(metadata.locator(".metadata-stats")).toHaveCount(0);
  await expect(metadata.getByRole("link")).toContainText("@codeverse-test-only/react");
  await expect(metadata).toContainText("Local descriptions and curated connections remain available.");
  await expect(page.locator(".selected-detail")).toHaveText(technologyById.react.detail);
  await expect(page.locator(".connected-button")).toHaveCount(getConnectedIds("react").length);
  await page.getByRole("button", { name: "Explore Next.js, Web", exact: true }).and(page.locator(".connected-button")).click();
  await expect(page.locator(".selected-title")).toHaveText("Next.js");
  await expect(metadata.getByRole("link")).toContainText("@codeverse-test-only/nextjs");
});

test("total network failure leaves the inspector usable and retry fetches again", async ({ page, metadataMock }) => {
  metadataMock.respond = async (id, route) => {
    if (metadataMock.requests.length === 1) await route.abort("failed");
    else await route.fulfill({ json: metadataFixture(id) });
  };
  await page.goto("/?technology=react");
  const metadata = page.getByRole("region", { name: "Software metadata" });
  await expect(metadata.getByRole("status")).toContainText("External signals are unavailable. Curated technology details and connections remain available.");
  await expect(page.locator(".selected-description")).toHaveText(technologyById.react.description);
  await expect(page.locator(".connected-button")).toHaveCount(getConnectedIds("react").length);
  await metadata.getByRole("button", { name: "Retry metadata" }).click();
  await expect(metadata.locator(".metadata-link").first()).toContainText("codeverse-test-only/react");
  await expect(metadata.getByRole("button", { name: "Retry metadata" })).toHaveCount(0);
  await expect(metadata.locator(".metadata-notice")).toHaveCount(0);
  expect(metadataMock.requests).toEqual(["react", "react"]);
});

test("npm failure preserves successful GitHub signals without inventing package data", async ({ page, metadataMock }) => {
  metadataMock.respond = async (id, route) => {
    const data = metadataFixture(id);
    data.npm = { status: "timeout", message: "Test-only npm request timed out." };
    await route.fulfill({ json: data });
  };
  await page.goto("/?technology=react");
  const metadata = page.getByRole("region", { name: "Software metadata" });
  await expect(metadata.getByRole("status")).toHaveText("Test-only npm request timed out.");
  await expect(metadata.getByRole("link")).toHaveCount(1);
  await expect(metadata.getByRole("link")).toHaveAttribute("href", "https://github.com/codeverse-test-only/react");
  await expect(metadata.locator(".metadata-stats dd")).toHaveText(["12,345", "678", "90"]);
  await expect(metadata.locator("details")).toHaveCount(0);
  await expect(metadata).toContainText("Local descriptions and curated connections remain available.");
  await expect(page.locator(".connected-button")).toHaveCount(getConnectedIds("react").length);
});

test("empty manifests and unconfigured npm sources have explicit fallback text", async ({ page, metadataMock }) => {
  metadataMock.respond = async (id, route) => {
    const data = metadataFixture(id);
    if (data.github.status === "ok") data.github.data.language = null;
    if (id === "nodejs") data.npm = { status: "not_configured", message: "Test-only source has no configured npm package." };
    else if (data.npm.status === "ok") {
      data.npm.data.license = null;
      data.npm.data.dependencies = {};
      data.npm.data.peerDependencies = {};
    }
    await route.fulfill({ json: data });
  };
  await page.goto("/?technology=react");
  const metadata = page.getByRole("region", { name: "Software metadata" });
  await expect(metadata).toContainText("Language not reported");
  await expect(metadata).toContainText("License: Not reported");
  await expect(metadata.locator("summary")).toHaveText(["Dependencies0", "Peer dependencies0"]);
  for (const details of await metadata.locator("details").all()) {
    await details.locator("summary").click();
    await expect(details.locator("li")).toHaveCount(0);
    await expect(details.getByText("None declared in the latest manifest.", { exact: true })).toBeVisible();
  }
  await selectFromSearch(page, "node js", "nodejs");
  await expect(metadata.getByRole("status")).toHaveText("Test-only source has no configured npm package.");
  await expect(metadata.getByRole("link")).toHaveCount(1);
  await expect(metadata.getByRole("link")).toContainText("codeverse-test-only/nodejs");
  await expect(metadata.locator("details")).toHaveCount(0);
  await expect(metadata.getByText(/Provider failures are retried/)).toHaveCount(0);
});

test("revisits deduplicate in-flight and completed requests without leaking late data", async ({ page, metadataMock }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  metadataMock.respond = async (id, route) => {
    if (id === "react") await pending;
    await route.fulfill({ json: metadataFixture(id) });
  };
  try {
    await page.goto("/?technology=react");
    await expect.poll(() => metadataMock.requests).toEqual(["react"]);
    await selectFromSearch(page, "next", "nextjs");
    await expect(page.locator(".metadata-link").first()).toContainText("codeverse-test-only/nextjs");
    await selectFromSearch(page, "react", "react");
    await expect(page.locator(".metadata-loading")).toBeVisible();
    await selectFromSearch(page, "next", "nextjs");
    const response = page.waitForResponse((result) => new URL(result.url()).pathname === "/api/technologies/react");
    release();
    await (await response).finished();
    await expect(page.locator(".selected-title")).toHaveText("Next.js");
    await expect(page.locator(".metadata-link").first()).toContainText("codeverse-test-only/nextjs");
    await selectFromSearch(page, "react", "react");
    await expect(page.locator(".metadata-link").first()).toContainText("codeverse-test-only/react");
    await expect(page.locator(".metadata-loading")).toHaveCount(0);
    expect(metadataMock.requests).toEqual(["react", "nextjs"]);
  } finally {
    release();
  }
});

for (const id of ["unknown-test-only", "constructor", "__proto__", ""]) {
  test(`invalid URL technology=${JSON.stringify(id)} displays a safe recoverable notice`, async ({ page, metadataMock }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/?technology=${encodeURIComponent(id)}`);
    await expect(page.locator(".navigation-notice")).toContainText("That technology isn't in this universe yet.");
    await expect(page.locator(".selected-panel")).toHaveCount(0);
    await expect(page.locator(".live-dot")).toHaveClass(/is-live/);
    await expect(page.locator('.node-target[aria-pressed="true"]')).toHaveCount(0);
    expect(metadataMock.requests).toEqual([]);
    await page.getByRole("button", { name: "Return to the atlas" }).click();
    await expect(page).toHaveURL((url) => !url.searchParams.has("technology"));
    await expect(page.locator(".navigation-notice")).toHaveCount(0);
    await selectFromSearch(page, "reactjs", "react");
    await expect(page.locator(".metadata-link").first()).toContainText("codeverse-test-only/react");
    expect(errors).toEqual([]);
  });
}

test.describe("responsive discovery", () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    test.describe(`${viewport.width}x${viewport.height}`, () => {
      test.use({ viewport, hasTouch: true });
      test("search selection and scrollable inspector stay within the viewport", async ({ page }) => {
        await page.goto("/");
        await expect(page.locator(".live-dot")).toHaveClass(/is-live/);
        const input = page.getByRole("combobox", { name: "Search technologies" });
        await input.tap();
        await expect(page.getByRole("option")).toHaveCount(technologies.length);
        await expectBounded(page.locator(".search-dropdown"), viewport.width, viewport.height);
        expect(await page.locator(".search-results").evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
        await input.fill("reactjs");
        await page.getByRole("option").first().tap();
        await expect(page).toHaveURL(/\?technology=react$/);
        await expect(page.locator(".selected-title")).toHaveText("React");
        await expect(page.locator(".search-dropdown")).toHaveCount(0);
        await expect(page.locator(".metadata-link").first()).toContainText("codeverse-test-only/react");
        const inspector = page.getByRole("complementary", { name: "React", exact: true });
        await expectBounded(inspector, viewport.width, viewport.height);
        expect(await inspector.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
        const peers = inspector.locator(".package-dependencies").nth(1);
        await peers.locator("summary").tap();
        await peers.locator("li").scrollIntoViewIfNeeded();
        await expect(peers.locator("li")).toBeInViewport();
        await expectBounded(inspector, viewport.width, viewport.height);
        await input.tap();
        await expectBounded(page.locator(".search-dropdown"), viewport.width, viewport.height);
        await input.press("Escape");
        await expect(page.locator(".selected-title")).toHaveText("React");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.getByRole("button", { name: "Back to universe", exact: true }).tap();
        await expect(page.locator(".selected-panel")).toHaveCount(0);
        await expect(page).toHaveURL((url) => !url.searchParams.has("technology"));
      });
    });
  }
});

test.describe("invalid metadata API IDs (real route, no browser or provider network)", () => {
  for (const id of ["unknown-test-only", "constructor", "__proto__"]) {
    test(`${id} is rejected before provider lookup`, async ({ request }) => {
      const response = await request.get(`/api/technologies/${encodeURIComponent(id)}`);
      expect(response.status()).toBe(404);
      expect(response.headers()["cache-control"]).toBe("no-store");
      expect(await response.json()).toEqual({ message: "Unknown technology ID." });
    });
  }
});

// Phase 4 intelligence layer: dependency expansion and explainable recommendations. The fixture is
// overridden to align `npm.name` with the curated source mapping and declare curated-neighbor
// package names so the dependency evidence resolves to real catalog technologies. No real package
// names or statistics are introduced.
test.describe("Phase 4 dependency exploration", () => {
  test("curated-neighbor package becomes a dashed gold line in the universe and a navigable target", async ({ page, metadataMock }) => {
    metadataMock.respond = async (id, route) => {
      const data = metadataFixture(id);
      // Align npm.name with the curated source "react" so dependencyEvidence actually runs.
      // Use a recent fetchedAt so the snapshot is fresh and activitySignal classifies the push.
      const nowIso = new Date().toISOString();
      if (data.npm.status === "ok") data.npm.fetchedAt = nowIso;
      if (data.github.status === "ok") data.github.fetchedAt = nowIso;
      if (data.npm.status === "ok") {
        data.npm.data = { ...data.npm.data, name: "react", url: "https://www.npmjs.com/package/react",
          version: "0.0.0-test-only", license: "MIT",
          // Declare curated package names so dependencyExpansion finds real in-catalog targets.
          dependencies: { vue: "^3.0.0", next: "^14.0.0" },
          peerDependencies: { "@angular/core": ">=17" },
        };
      }
      // Provide pushedAt to exercise activitySignal without depending on real-world statistics.
      if (data.github.status === "ok") {
        data.github.data = { ...data.github.data, pushedAt: new Date(Date.now() - 86_400_000).toISOString() };
      }
      await route.fulfill({ json: data });
    };
    await page.goto("/?technology=react");
    const inspector = page.getByRole("complementary", { name: "React", exact: true });
    await expect(inspector.locator(".activity-signal strong")).toHaveText("Active");
    const dependencySection = inspector.getByRole("region", { name: "Dependency exploration" });
    await expect(dependencySection).toBeVisible();
    await expect(dependencySection).toContainText("react@0.0.0-test-only");
    // Curated-neighbor packages render as "Explore in universe" buttons using the npm package name.
    const exploreButtons = dependencySection.getByRole("button").filter({ hasText: "Explore in universe" });
    const external = dependencySection.getByRole("link").filter({ hasText: "View on npm" });
    await expect(exploreButtons).toHaveCount(3);
    await expect(exploreButtons.filter({ hasText: /^vue/ })).toBeVisible();
    await expect(exploreButtons.filter({ hasText: /^next/ })).toBeVisible();
    await expect(exploreButtons.filter({ hasText: /^@angular\/core/ })).toBeVisible();
    await expect(external).toHaveCount(0);
    await expect(dependencySection.locator(".metadata-caption").first()).toContainText("Exact catalog package matches only.");
    // Toggle expansion to reveal dashed lines and the bounded cap is acknowledged.
    await inspector.getByRole("button", { name: /Show \d+ dependency links/ }).click();
    await expect(inspector.getByRole("button", { name: /Collapse dependency links/ })).toBeVisible();
    // Clicking the curated-neighbor button navigates to that technology without breaking the URL.
    await exploreButtons.filter({ hasText: /^vue/ }).click();
    await expect(page).toHaveURL(/\?technology=vue$/);
    await expect(page.locator(".selected-title")).toHaveText("Vue");
    // The previous expansion is reset on navigation (popstate handler), so the new inspector starts clean.
    await expect(inspector).toHaveCount(0);
  });

  test("declared but non-catalog packages remain external npm links and never invent catalog edges", async ({ page, metadataMock }) => {
    metadataMock.respond = async (id, route) => {
      const data = metadataFixture(id);
      if (data.npm.status === "ok") {
        data.npm.data = { ...data.npm.data, name: "react", url: "https://www.npmjs.com/package/react",
          version: "0.0.0-test-only", license: "MIT",
          dependencies: { "test-only-external-pkg": "^1.0.0", next: "^14.0.0" },
          peerDependencies: {},
        };
      }
      await route.fulfill({ json: data });
    };
    await page.goto("/?technology=react");
    const inspector = page.getByRole("complementary", { name: "React", exact: true });
    const dependencySection = inspector.getByRole("region", { name: "Dependency exploration" });
    await expect(dependencySection.getByRole("link", { name: /test-only-external-pkg/ })).toHaveAttribute("href", "https://www.npmjs.com/package/test-only-external-pkg");
    await expect(dependencySection.getByRole("button").filter({ hasText: /^next/ })).toBeVisible();
    await expect(dependencySection.locator(".metadata-caption").last()).toContainText("Packages outside this catalog stay external.");
  });

  test("dependency expansion collapses on Back navigation and never persists", async ({ page, metadataMock }) => {
    metadataMock.respond = async (id, route) => {
      const data = metadataFixture(id);
      if (data.npm.status === "ok") {
        data.npm.data = { ...data.npm.data, name: "react", url: "https://www.npmjs.com/package/react",
          version: "0.0.0-test-only", license: "MIT",
          dependencies: { next: "^14.0.0", vue: "^3.0.0" }, peerDependencies: {} };
      }
      await route.fulfill({ json: data });
    };
    await page.goto("/?technology=react");
    const inspector = page.getByRole("complementary", { name: "React", exact: true });
    await inspector.getByRole("button", { name: /Show \d+ dependency links/ }).click();
    await expect(inspector.getByRole("button", { name: /Collapse dependency links/ })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL((url) => !url.searchParams.has("technology"));
    await expect(page.locator(".selected-panel")).toHaveCount(0);
    await page.goForward();
    await expect(page.locator(".selected-title")).toHaveText("React");
    // The active expansion must be reset on the popstate/codeverse:navigation event.
    await expect(inspector.getByRole("button", { name: /Show \d+ dependency links/ })).toBeVisible();
  });
});

test.describe("Phase 4 recommendations", () => {
  test("explainable recommendations navigate without altering URL semantics", async ({ page, metadataMock }) => {
    void metadataMock;
    await page.goto("/?technology=react");
    const inspector = page.getByRole("complementary", { name: "React", exact: true });
    const recommendations = inspector.getByRole("region", { name: "Recommended explorations" });
    await expect(recommendations).toBeVisible();
    const items = recommendations.getByRole("button");
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(4);
    // Every recommendation has a reason that references React.
    for (let index = 0; index < count; index++) {
      await expect(items.nth(index).locator("small")).toContainText(/React/);
    }
    await expect(recommendations.locator(".metadata-caption")).toContainText(/not endorsements/);
    // Clicking a recommendation navigates to that technology.
    const firstName = (await items.first().locator("span").first().textContent())?.trim() ?? "";
    await items.first().click();
    await expect(page.locator(".selected-title")).toHaveText(firstName);
    await expect(page).toHaveURL(/\?technology=/);
  });

  test("missing or invalid technology selection omits the recommendations section", async ({ page, metadataMock }) => {
    void metadataMock;
    await page.goto("/?test-only=preserved");
    await expect(page.locator(".selected-panel")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Recommended explorations" })).toHaveCount(0);
  });
});
