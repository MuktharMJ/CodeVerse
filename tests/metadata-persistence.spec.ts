import { expect, test } from "@playwright/test";
import { createMetadataService, type SnapshotStore } from "../src/services/metadata-transport";
import type { ProviderResult } from "../src/types/metadata";

const epoch = Date.parse("2026-09-07T12:00:00Z");
const ttl = 15 * 60_000;
const githubPayload = {
  full_name: "react/react", stargazers_count: 123, forks_count: 45,
  open_issues_count: 6, language: "JavaScript",
};
const githubData = {
  repository: "react/react", url: "https://github.com/react/react",
  stars: 123, forks: 45, openIssues: 6, language: "JavaScript",
};
const npmData = {
  name: "react", url: "https://www.npmjs.com/package/react", version: "19.2.0",
  description: null, license: "MIT", dependencies: {}, peerDependencies: {},
};
const githubOnly = { custom: { github: "react/react" } };

function snapshot(data: unknown, fetchedAt = epoch): Extract<ProviderResult<unknown>, { status: "ok" }> {
  return { status: "ok", data, fetchedAt: new Date(fetchedAt).toISOString() };
}

function memoryStore() {
  const entries = new Map<string, ProviderResult<unknown>>();
  const reads: unknown[][] = [];
  const writes: unknown[][] = [];
  const store: SnapshotStore = {
    async read(id, provider, sourceKey) {
      reads.push([id, provider, sourceKey]);
      return entries.get(JSON.stringify([id, provider, sourceKey])) ?? null;
    },
    async write(id, provider, sourceKey, result) {
      writes.push([id, provider, sourceKey, result]);
      entries.set(JSON.stringify([id, provider, sourceKey]), result);
    },
  };
  function seed(id: string, provider: "github" | "npm", sourceKey: string, result: ProviderResult<unknown>) {
    entries.set(JSON.stringify([id, provider, sourceKey]), result);
  }
  return { store, reads, writes, seed };
}

test("fresh persisted providers require no token or fetch and sanitize extra fields", async () => {
  const db = memoryStore();
  db.seed("react", "github", "react/react", {
    ...snapshot({ ...githubData, secret: "private" }, epoch - 30_000),
    stale: true, refreshStatus: "unavailable", retryAt: "private",
  });
  db.seed("react", "npm", "react", snapshot(npmData, epoch - 60_000));
  let fetches = 0;
  const get = createMetadataService({ now: () => epoch, snapshotStore: db.store,
    fetch: async () => { fetches++; throw new Error("Must not fetch"); } });
  expect(await get("react")).toEqual({ technologyId: "react",
    github: snapshot(githubData, epoch - 30_000), npm: snapshot(npmData, epoch - 60_000) });
  await get("react");
  expect(fetches).toBe(0);
  expect(db.reads).toEqual([["react", "github", "react/react"], ["react", "npm", "react"]]);
  expect(db.writes).toEqual([]);
});

test("persisted freshness expires from fetchedAt, not the read time, and refresh saves success", async () => {
  const db = memoryStore();
  db.seed("custom", "github", "react/react", snapshot(githubData, epoch - ttl + 1));
  let clock = epoch;
  let fetches = 0;
  const get = createMetadataService({ sources: githubOnly, now: () => clock, snapshotStore: db.store,
    fetch: async () => { fetches++; return Response.json(githubPayload); } });
  await get("custom");
  expect(fetches).toBe(0);
  clock++;
  expect((await get("custom")).github).toEqual(snapshot(githubData, clock));
  expect(fetches).toBe(1);
  expect(db.writes).toEqual([["custom", "github", "react/react", snapshot(githubData, clock)]]);
  const restarted = createMetadataService({ sources: githubOnly, now: () => clock, snapshotStore: db.store,
    fetch: async () => { fetches++; throw new Error("Must not fetch"); } });
  expect((await restarted("custom")).github).toEqual(snapshot(githubData, clock));
  expect(fetches).toBe(1);
});

test("stale failures keep last good fetchedAt and retry after failure TTL, not success TTL", async () => {
  const db = memoryStore();
  const old = snapshot(githubData, epoch - ttl);
  db.seed("custom", "github", "react/react", old);
  let clock = epoch;
  let fetches = 0;
  const get = createMetadataService({ sources: githubOnly, now: () => clock, snapshotStore: db.store,
    fetch: async () => {
      fetches++;
      return fetches < 3 ? new Response(null, { status: 503 }) : Response.json(githubPayload);
    } });
  const stale = { ...old, stale: true, refreshStatus: "unavailable" };
  expect((await get("custom")).github).toEqual(stale);
  clock += 59_999;
  expect((await get("custom")).github).toEqual(stale);
  expect(fetches).toBe(1);
  clock++;
  expect((await get("custom")).github).toEqual(stale);
  expect(fetches).toBe(2);
  expect(db.writes).toEqual([]);
  clock += 60_000;
  expect((await get("custom")).github).toEqual(snapshot(githubData, clock));
  expect(db.writes).toHaveLength(1);
});

test("stale rate limits expose retryAt and retry exactly at the provider deadline", async () => {
  const db = memoryStore();
  const old = snapshot(githubData, epoch - ttl);
  db.seed("custom", "github", "react/react", old);
  let clock = epoch;
  let fetches = 0;
  const get = createMetadataService({ sources: githubOnly, now: () => clock, snapshotStore: db.store,
    fetch: async () => {
      fetches++;
      return fetches === 1 ? new Response(null, { status: 429, headers: { "Retry-After": "120" } })
        : Response.json(githubPayload);
    } });
  expect((await get("custom")).github).toEqual({ ...old, stale: true, refreshStatus: "rate_limited",
    retryAt: new Date(epoch + 120_000).toISOString() });
  clock += 119_999;
  await get("custom");
  expect(fetches).toBe(1);
  expect(db.writes).toEqual([]);
  clock++;
  expect((await get("custom")).github).toEqual(snapshot(githubData, clock));
  expect(fetches).toBe(2);
});

test("stale timeout retains GitHub while npm independently uses its fresh snapshot", async () => {
  const db = memoryStore();
  const old = snapshot(githubData, epoch - ttl);
  db.seed("react", "github", "react/react", old);
  db.seed("react", "npm", "react", snapshot(npmData));
  let signal: AbortSignal | null | undefined;
  const get = createMetadataService({ now: () => epoch, snapshotStore: db.store,
    fetch: async (_, init) => { signal = init?.signal; return new Promise(() => {}); } });
  expect(await get("react")).toEqual({ technologyId: "react",
    github: { ...old, stale: true, refreshStatus: "timeout" }, npm: snapshot(npmData) });
  expect(signal?.aborted).toBe(true);
  expect(db.writes).toEqual([]);
});

test("source changes invalidate memory, use new snapshot keys, and never fall back to the old source", async () => {
  const db = memoryStore();
  db.seed("custom", "github", "react/react", snapshot(githubData));
  const sources = { custom: { github: "react/react" } };
  const urls: string[] = [];
  const get = createMetadataService({ sources, now: () => epoch, snapshotStore: db.store,
    fetch: async (input) => { urls.push(String(input)); return new Response(null, { status: 503 }); } });
  expect((await get("custom")).github.status).toBe("ok");
  sources.custom.github = "other/repo";
  expect((await get("custom")).github.status).toBe("unavailable");
  expect(urls).toEqual(["https://api.github.com/repos/other/repo"]);
  expect(db.reads).toEqual([["custom", "github", "react/react"], ["custom", "github", "other/repo"]]);
  expect(db.writes).toEqual([]);
});

test("source-aware in-flight calls preserve exact promise identity without sharing changed sources", async () => {
  const sources = { custom: { github: "react/react" } };
  const releases: Array<(response: Response) => void> = [];
  const get = createMetadataService({ sources,
    fetch: () => new Promise<Response>((resolve) => { releases.push(resolve); }) });
  const first = get("custom");
  expect(get("custom")).toBe(first);
  sources.custom.github = "other/repo";
  const second = get("custom");
  expect(second).not.toBe(first);
  releases[0](Response.json(githubPayload));
  await first;
  expect(get("custom")).toBe(second);
  releases[1](Response.json({ ...githubPayload, full_name: "other/repo" }));
  expect((await second).github).toMatchObject({ status: "ok", data: { repository: "other/repo" } });
});

test("malformed GitHub snapshots are ignored, including unsafe URLs, counts, and timestamps", async () => {
  const invalid: unknown[] = [
    null, [], {}, { status: "unavailable", message: "private" },
    ...[null, [], {}, { ...githubData, repository: "other/repo" },
      { ...githubData, url: "https://github.com.evil.example/react/react" },
      { ...githubData, url: "https://github.com/other/repo" },
      { ...githubData, url: "javascript:alert(1)" },
      { ...githubData, stars: -1 }, { ...githubData, forks: "45" },
      { ...githubData, openIssues: 1.5 }, { ...githubData, stars: Number.MAX_SAFE_INTEGER + 1 },
      { ...githubData, stars: Infinity }, { ...githubData, language: {} },
    ].map((data) => snapshot(data)),
    { ...snapshot(githubData), fetchedAt: "invalid" },
    { ...snapshot(githubData), fetchedAt: epoch },
    snapshot(githubData, epoch + 1),
  ];
  let fetches = 0;
  for (const stored of invalid) {
    const get = createMetadataService({ sources: githubOnly, now: () => epoch,
      snapshotStore: { read: async () => stored as ProviderResult<unknown>, write: async () => {} },
      fetch: async () => { fetches++; return new Response(null, { status: 503 }); } });
    expect((await get("custom")).github).toEqual({ status: "unavailable", message: "Provider metadata is currently unavailable." });
  }
  expect(fetches).toBe(invalid.length);
});

test("malformed npm snapshots cannot supply unsafe URLs or dependency maps", async () => {
  const invalid = [null, [], {}, { ...npmData, name: "other" },
    { ...npmData, url: "https://www.npmjs.com.evil.example/package/react" },
    { ...npmData, url: "https://www.npmjs.com/package/other" },
    { ...npmData, version: " " }, { ...npmData, description: 1 }, { ...npmData, license: {} },
    { ...npmData, dependencies: { secret: 123 } }, { ...npmData, peerDependencies: [] },
    { ...npmData, dependencies: undefined }];
  let fetches = 0;
  for (const data of invalid) {
    const get = createMetadataService({ sources: { custom: { npm: "react" } }, now: () => epoch,
      snapshotStore: { read: async () => snapshot(data), write: async () => {} },
      fetch: async () => { fetches++; return Response.json(npmData); } });
    expect((await get("custom")).npm).toEqual(snapshot(npmData));
  }
  expect(fetches).toBe(invalid.length);
});

test("missing GitHub and npm never fetch or read snapshots; only own catalog IDs are accepted", async () => {
  const sources = Object.assign(Object.create({ inherited: { github: "react/react" } }), {
    custom: {}, npmOnly: { npm: "react" },
  });
  const db = memoryStore();
  db.seed("npmOnly", "npm", "react", snapshot(npmData));
  let fetches = 0;
  const get = createMetadataService({ sources, now: () => epoch, snapshotStore: db.store,
    fetch: async () => { fetches++; throw new Error("Must not fetch"); } });
  expect(await get("custom")).toMatchObject({ github: { status: "not_configured" }, npm: { status: "not_configured" } });
  expect(db.reads).toEqual([]);
  expect(await get("npmOnly")).toMatchObject({ github: { status: "not_configured" }, npm: snapshot(npmData) });
  for (const id of ["inherited", "__proto__", "constructor", "toString", "unknown"]) {
    await expect(get(id)).rejects.toThrow("Unknown technology ID");
  }
  expect(fetches).toBe(0);
  expect(db.reads).toEqual([["npmOnly", "npm", "react"]]);
});

test("invalid curated sources cannot construct external requests or trusted snapshot links", async () => {
  let calls = 0;
  for (const source of [{ github: "../evil" }, { github: "https://evil.example/repo" },
    { github: "owner/repo?query" }, { npm: "../evil" }, { npm: "https://evil.example" }]) {
    const get = createMetadataService({ sources: { custom: source },
      snapshotStore: { read: async () => { calls++; return null; }, write: async () => { calls++; } },
      fetch: async () => { calls++; throw new Error("Must not fetch"); } });
    await expect(get("custom")).rejects.toThrow("Invalid technology source");
  }
  expect(calls).toBe(0);
});

test("snapshot read/write exceptions are swallowed and in-memory last good survives write failures", async () => {
  for (const synchronous of [false, true]) {
    let clock = epoch;
    let fetches = 0;
    let writes = 0;
    const fail = () => {
      if (synchronous) throw new Error("private database credentials");
      return Promise.reject(new Error("private database credentials"));
    };
    const get = createMetadataService({ sources: githubOnly, now: () => clock,
      snapshotStore: { read: fail, write: () => { writes++; return fail(); } },
      fetch: async () => {
        fetches++;
        return fetches === 1 ? Response.json(githubPayload) : new Response(null, { status: 503 });
      } });
    expect((await get("custom")).github).toEqual(snapshot(githubData));
    await get("custom");
    expect(fetches).toBe(1);
    clock += ttl;
    expect((await get("custom")).github).toEqual({ ...snapshot(githubData), stale: true, refreshStatus: "unavailable" });
    expect(writes).toBe(1);
  }
});

test("hung snapshot reads and writes have bounded waits and preserve in-flight deduplication", async () => {
  let reads = 0;
  let writes = 0;
  let fetches = 0;
  const get = createMetadataService({ sources: githubOnly, now: () => epoch,
    snapshotStore: {
      read: () => { reads++; return new Promise(() => {}); },
      write: () => { writes++; return new Promise(() => {}); },
    },
    fetch: async () => { fetches++; return Response.json(githubPayload); } });
  const started = Date.now();
  const first = get("custom");
  expect(get("custom")).toBe(first);
  expect((await first).github).toEqual(snapshot(githubData));
  expect(Date.now() - started).toBeLessThan(5_000);
  expect((await get("custom")).github).toEqual(snapshot(githubData));
  expect([reads, writes, fetches]).toEqual([1, 1, 1]);
});
