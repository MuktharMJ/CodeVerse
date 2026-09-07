import { expect, test as base } from "@playwright/test";
import postgres, { type Sql } from "postgres";
import { localCatalog } from "../src/data/local-catalog";
import { readDatabaseCatalog } from "../src/db/catalog";
import { readSnapshot, writeSnapshot } from "../src/db/snapshots";
import { createMetadataService } from "../src/services/metadata-transport";
import type { Catalog, CatalogTechnology } from "../src/types/catalog";

// Opt in only against the dedicated, already migrated/seeded public test database.
// Start the application with DATABASE_URL equal to TEST_DATABASE_URL as well.
// A reused Playwright server does not inherit changes to the runner's environment.
const testUrl = process.env.TEST_DATABASE_URL?.trim();
const databaseEnabled = process.env.CODEVERSE_DATABASE_TESTS === "1" && !!testUrl;
const technology: CatalogTechnology = {
  id: "codeverse-test-node",
  slug: "codeverse-test-profile",
  name: "Codeverse Test Beacon",
  category: "Web",
  description: "Synthetic test-only quasarweave discovery fixture.",
  detail: "Dedicated database fixture, not a production technology.",
  aliases: ["codeverse-unique-alias-beacon"],
  symbol: "CV",
  position: [1, 1, 0],
  size: 0.3,
  sources: {},
};
const relationship = {
  id: "codeverse-test-node-react",
  source: technology.id,
  target: "react",
  kind: "ecosystem",
  provenance: "curated",
  directed: false,
  explanation: "Test-only ecosystem relationship to React; not a dependency claim.",
};

const test = base.extend<{ database: { sql: Sql; catalog: Catalog } }>({
  database: async ({ request }, provide) => {
    expect(databaseEnabled, "Database tests require both explicit opt-in and TEST_DATABASE_URL").toBe(true);
    // Compare booleans so failed assertions never print credentials.
    expect(process.env.DATABASE_URL?.trim() === testUrl,
      "Runner and application must use the same dedicated test DATABASE_URL").toBe(true);
    let dedicated = false;
    try {
      const url = new URL(testUrl!);
      dedicated = ["postgres:", "postgresql:"].includes(url.protocol)
        && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port === "55432";
    } catch { /* Report only the safe validation message below. */ }
    expect(dedicated, "Use only the dedicated local test PostgreSQL instance on port 55432").toBe(true);
    const sql = postgres(testUrl!, { max: 1, connect_timeout: 2, idle_timeout: 5,
      connection: { search_path: "public", statement_timeout: 3000 }, onnotice: () => {} });
    let created = false;
    try {
      expect((await sql`SELECT current_schema() AS schema`)[0].schema).toBe("public");
      const seeded = await readDatabaseCatalog(sql);
      expect(seeded.origin).toBe("database");
      expect(seeded.technologies).toHaveLength(17);
      expect(seeded.relationships).toHaveLength(29);
      // Commit before making HTTP requests: the server cannot see an open transaction.
      // Plain INSERT deliberately fails on collisions instead of replacing existing rows.
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO public.technologies
            (id, slug, name, category, description, detail, aliases, symbol, position, size, "order", sources)
          VALUES (${technology.id}, ${technology.slug}, ${technology.name}, ${technology.category},
            ${technology.description}, ${technology.detail}, ${[...technology.aliases]}, ${technology.symbol},
            ${[...technology.position]}, ${technology.size}, 10000, '{}'::jsonb)
        `;
        await tx`
          INSERT INTO public.relationships (id, source, target, kind, provenance, directed, explanation, "order")
          VALUES (${relationship.id}, ${relationship.source}, ${relationship.target}, ${relationship.kind},
            ${relationship.provenance}, ${relationship.directed}, ${relationship.explanation}, 10000)
        `;
      });
      created = true;
      const response = await request.get("/api/catalog");
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toBe("no-store");
      const catalog: Catalog = await response.json();
      expect(catalog.origin, "The running server must read the dedicated test database").toBe("database");
      expect(catalog.technologies).toHaveLength(18);
      expect(catalog.relationships).toHaveLength(30);
      expect(catalog.technologies.find(({ id }) => id === technology.id)).toEqual(technology);
      expect(catalog.relationships.find(({ id }) => id === relationship.id)).toEqual(relationship);
      await provide({ sql, catalog });
    } finally {
      try {
        if (created) await sql.begin(async (tx) => {
          await tx`DELETE FROM public.snapshots WHERE technology_id = ${technology.id}`;
          await tx`DELETE FROM public.relationships WHERE id = ${relationship.id}`;
          await tx`DELETE FROM public.technologies WHERE id = ${technology.id}`;
        });
      } finally {
        await sql.end({ timeout: 2 });
      }
    }
  },
});

test.describe("Phase 3 database catalog", () => {
  test.skip(!databaseEnabled, "Requires CODEVERSE_DATABASE_TESTS=1 and dedicated TEST_DATABASE_URL");

  test("real catalog API searches database names, slugs, partials, aliases, categories and descriptions", async ({ request, database }) => {
    for (const query of [technology.name, technology.id, technology.slug, "Test Bea",
      technology.aliases[0], `  ${technology.aliases[0].toUpperCase()}  `, "quasarweave"]) {
      await test.step(`search ${query.trim()}`, async () => {
        const response = await request.get("/api/catalog", { params: { q: query } });
        expect(response.status()).toBe(200);
        expect(response.headers()["cache-control"]).toBe("no-store");
        expect(await response.json()).toEqual({ origin: "database", technologies: [technology] });
      });
    }
    const category = await request.get("/api/catalog", { params: { q: "Web" } });
    expect(category.status()).toBe(200);
    const matches: Pick<Catalog, "origin" | "technologies"> = await category.json();
    expect(matches.origin).toBe("database");
    expect(matches.technologies.map(({ id }) => id)).toEqual(expect.arrayContaining(
      database.catalog.technologies.filter(({ category }) => category === "Web").map(({ id }) => id),
    ));
    for (const q of ["", "   "]) {
      const response = await request.get("/api/catalog", { params: { q } });
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ origin: "database", technologies: database.catalog.technologies });
    }
    const missing = await request.get("/api/catalog", { params: { q: "codeverse-test-no-such-signal" } });
    expect(missing.status()).toBe(200);
    expect(await missing.json()).toEqual({ origin: "database", technologies: [] });
  });

  for (const entry of ["alias search", "direct slug"] as const) {
    test(`${entry} renders the database node, explains its relationship and preserves slug history`, async ({ page, database }) => {
      expect(database.catalog.origin).toBe("database");
      const externalRequests: string[] = [];
      const metadataIds: string[] = [];
      await page.context().route(/^https?:\/\/([^/]+\.)?(github\.com|githubusercontent\.com|npmjs\.org|npmjs\.com)(\/|$)/, async (route) => {
        externalRequests.push(route.request().url());
        await route.abort("blockedbyclient");
      });
      page.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        if (path.startsWith("/api/technologies/")) metadataIds.push(path.split("/").pop()!);
      });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const extras = "test-only=preserved";
      await page.goto(entry === "direct slug"
        ? `/?${extras}&technology=${technology.slug}#atlas` : `/?${extras}#atlas`);
      await expect(page.getByRole("main")).toHaveAttribute("data-catalog-origin", "database");
      await expect(page.locator(".live-dot")).toHaveClass(/is-live/);
      await expect(page.locator(".node-target")).toHaveCount(18);
      await expect(page.locator(".universe-stats")).toHaveAttribute("aria-label", "18 technologies and 30 connections");
      if (entry === "alias search") {
        const input = page.getByRole("combobox", { name: "Search technologies" });
        await input.fill(technology.aliases[0]);
        await expect(page.getByRole("option")).toHaveCount(1);
        await expect(page.getByRole("option")).toContainText(technology.name);
        await input.press("Enter");
        await expect(input).toHaveValue("");
      }
      const node = page.getByRole("button", { name: `Explore ${technology.name}, Web`, exact: true });
      for (const action of ["selected", "reset", "back", "forward", "back"] as const) {
        if (action === "reset") await page.getByRole("button", { name: "Reset view and return to universe" }).click();
        else if (action === "back") await page.goBack();
        else if (action === "forward") await page.goForward();
        const selected = action === "selected" || action === "back";
        await expect(page).toHaveURL((url) => url.searchParams.get("technology") === (selected ? technology.slug : null)
          && url.searchParams.get("test-only") === "preserved" && url.hash === "#atlas");
        await expect(node).toHaveAttribute("aria-pressed", String(selected));
        await expect(page.locator('.node-target[aria-pressed="true"]')).toHaveCount(selected ? 1 : 0);
        if (selected) {
          await expect(page.getByRole("complementary", { name: technology.name, exact: true })).toBeVisible();
          await expect(node).toHaveClass(/is-emphasized/);
          await expect(node.locator(".node-category")).toHaveText("IN FOCUS");
          await expect(page.locator(".sr-only[aria-live]")).toContainText(`Focused on ${technology.name}.`);
        } else await expect(page.locator(".selected-panel")).toHaveCount(0);
      }
      await expect(page.locator(".selected-description")).toHaveText(technology.description);
      await expect(page.locator(".connection-count")).toHaveText("1");
      await expect(page.locator(".connected-button")).toHaveAccessibleName("Explore React, Web");
      await expect(page.locator(".node-target.is-connected")).toHaveCount(1);
      await expect(page.locator('.node-target[aria-label="Explore React, Web"]')).toHaveClass(/is-connected/);
      const explanation = page.getByText("Why these connections?", { exact: true });
      await explanation.focus();
      await explanation.press("Enter");
      await expect(page.getByText(relationship.explanation, { exact: true })).toBeVisible();
      await expect(page.getByText("Ecosystem relationship / curated", { exact: true })).toBeVisible();
      const metadata = page.getByRole("region", { name: "Software metadata" });
      await expect(metadata.getByRole("status")).toHaveText([
        "No GitHub repository is curated for this technology.",
        "No npm package is curated for this technology.",
      ]);
      await expect(metadata.getByRole("link")).toHaveCount(0);
      expect(metadataIds.length).toBeGreaterThan(0);
      expect(new Set(metadataIds)).toEqual(new Set([technology.id]));
      expect(externalRequests).toEqual([]);
    });
  }

  test("unconfigured database sources return real API statuses without provider or snapshot work", async ({ request, database }) => {
    const sources = database.catalog.technologies.find(({ id }) => id === technology.id)!.sources;
    let operations = 0;
    const get = createMetadataService({ sources: { [technology.id]: sources },
      fetch: async () => { operations++; throw new Error("Must not fetch providers"); },
      snapshotStore: {
        read: async () => { operations++; return null; },
        write: async () => { operations++; },
      },
    });
    const expected = await get(technology.id);
    expect(expected).toMatchObject({ technologyId: technology.id,
      github: { status: "not_configured" }, npm: { status: "not_configured" } });
    expect(operations).toBe(0);
    for (const id of [technology.id, technology.slug]) {
      const response = await request.get(`/api/technologies/${id}`);
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toBe("no-store");
      expect(await response.json()).toEqual(expected);
    }
    expect(await database.sql`SELECT id FROM public.snapshots WHERE technology_id = ${technology.id}`).toHaveLength(0);
  });

  test("normalized test-only metadata persists in PostgreSQL and survives a service restart", async ({ database }) => {
    const { sql } = database;
    // Synthetic statistics belong only to this inserted fixture, never to seeded technologies.
    const repository = "codeverse-test-only/fixture";
    const sources = { [technology.id]: { github: repository } };
    const now = Date.now();
    const snapshotStore = {
      read: (id: string, provider: "github" | "npm", key: string) => readSnapshot(id, provider, key, sql),
      write: (id: string, provider: "github" | "npm", key: string, result: Parameters<typeof writeSnapshot>[3]) =>
        writeSnapshot(id, provider, key, result, sql),
    };
    let fetches = 0;
    const get = createMetadataService({ sources, now: () => now, snapshotStore,
      fetch: async (input) => {
        fetches++;
        expect(String(input)).toBe(`https://api.github.com/repos/${repository}`);
        return Response.json({ full_name: repository, stargazers_count: 12, forks_count: 3,
          open_issues_count: 1, language: "TypeScript", testOnlyExtra: "must not persist" });
      },
    });
    const expected = { status: "ok", fetchedAt: new Date(now).toISOString(), data: {
      repository, url: `https://github.com/${repository}`, stars: 12, forks: 3, openIssues: 1, language: "TypeScript",
    } };
    expect((await get(technology.id)).github).toEqual(expected);
    expect(fetches).toBe(1);
    expect(await readSnapshot(technology.id, "github", repository, sql)).toEqual(expected);
    expect(await readSnapshot(technology.id, "github", "codeverse-test-only/other", sql)).toBeNull();
    const restarted = createMetadataService({ sources, now: () => now + 1000, snapshotStore,
      fetch: async () => { fetches++; throw new Error("Fresh persisted metadata must not fetch"); } });
    expect((await restarted(technology.id)).github).toEqual(expected);
    expect(fetches).toBe(1);
    expect(await sql`SELECT id FROM public.snapshots WHERE technology_id = ${technology.id}`).toHaveLength(1);
  });
});

base.describe("Phase 3 local catalog fallback", () => {
  base.skip(process.env.CODEVERSE_EXPECT_FALLBACK !== "1", "Requires CODEVERSE_EXPECT_FALLBACK=1 and an unconfigured/unavailable application database");

  base("real API returns the complete local catalog and supports alias and empty searches", async ({ request }) => {
    const response = await request.get("/api/catalog");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(await response.json()).toEqual(localCatalog);
    const alias = await request.get("/api/catalog", { params: { q: "reactjs" } });
    expect(alias.status()).toBe(200);
    expect(await alias.json()).toEqual({ origin: "local", technologies: [localCatalog.technologies.find(({ id }) => id === "react")] });
    const empty = await request.get("/api/catalog", { params: { q: "" } });
    expect(empty.status()).toBe(200);
    expect(await empty.json()).toEqual({ origin: "local", technologies: localCatalog.technologies });
  });

  base("server page keeps the local universe and browser search available", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("main")).toHaveAttribute("data-catalog-origin", "local");
    await expect(page.locator(".edition-label")).toContainText("LOCAL");
    await expect(page.locator(".live-dot")).toHaveClass(/is-live/);
    await expect(page.locator(".node-target")).toHaveCount(17);
    await expect(page.locator(".universe-stats")).toHaveAttribute("aria-label", "17 technologies and 29 connections");
    await page.getByRole("combobox", { name: "Search technologies" }).fill("reactjs");
    await expect(page.getByRole("option")).toHaveCount(1);
    await expect(page.getByRole("option")).toContainText("React");
  });
});
