import { expect, test } from "@playwright/test";
import { createMetadataService, type SnapshotStore } from "../src/services/metadata-transport";
import type { GitHubMetadata, ProviderResult } from "../src/types/metadata";

const epoch = Date.parse("2026-09-07T12:00:00Z");
const ttl = 15 * 60_000;
const sources = { custom: { github: "react/react" } };
const githubPayload = {
  full_name: "react/react", stargazers_count: 123, forks_count: 45,
  open_issues_count: 6, language: "JavaScript",
};
const githubData: GitHubMetadata = {
  repository: "react/react", url: "https://github.com/react/react",
  stars: 123, forks: 45, openIssues: 6, language: "JavaScript",
};
const pushedAt = "2026-09-06T10:20:30Z";

function snapshot(data: unknown, fetchedAt = epoch): Extract<ProviderResult<unknown>, { status: "ok" }> {
  return { status: "ok", data, fetchedAt: new Date(fetchedAt).toISOString() };
}

const cases: Array<{
  name: string;
  input: { pushedAt?: unknown; archived?: unknown };
  expected: Pick<GitHubMetadata, "pushedAt" | "archived">;
}> = [
  { name: "both activity fields", input: { pushedAt, archived: true }, expected: { pushedAt, archived: true } },
  { name: "legacy payload without activity fields", input: {}, expected: {} },
  { name: "explicit null and false", input: { pushedAt: null, archived: false }, expected: { pushedAt: null, archived: false } },
  { name: "timestamp alone", input: { pushedAt }, expected: { pushedAt } },
  { name: "archived alone", input: { archived: false }, expected: { archived: false } },
  ...["2024-02-29T10:20:30Z", "2026-09-06T10:20:30.123Z", "2026-09-06T10:20:30+05:30",
    "2026-09-06T10:20:30.123-04:00"].map((timestamp) => ({
    name: `ISO timestamp ${timestamp}`, input: { pushedAt: timestamp }, expected: { pushedAt: timestamp },
  })),
  // Optional activity is best-effort: malformed fields are omitted, not coerced or allowed to discard valid counts.
  ...["", "invalid", "2026-09-06", "September 6, 2026", "2026-09-06T10:20:30",
    "2026-09-06 10:20:30Z", "2026-09-06T24:00:00Z", "2026-09-06T10:20:60Z",
    "2026-13-06T10:20:30Z", "2026-02-30T10:20:30Z", "2026-02-29T10:20:30Z",
    "2026-04-31T10:20:30Z", "2026-09-06T10:20:30+24:00", ` ${pushedAt}`, `${pushedAt}\n`,
    epoch, false, {}, []].map((invalid) => ({
    name: `malformed pushedAt ${JSON.stringify(invalid)}`,
    input: { pushedAt: invalid, archived: false }, expected: { archived: false },
  })),
  ...[null, "false", "true", 0, 1, {}, []].map((invalid) => ({
    name: `malformed archived ${JSON.stringify(invalid)}`,
    input: { pushedAt, archived: invalid }, expected: { pushedAt },
  })),
  { name: "both malformed", input: { pushedAt: "invalid", archived: "false" }, expected: {} },
];

for (const entry of cases) {
  test(`provider activity: ${entry.name}`, async () => {
    const calls: string[] = [];
    const payload: Record<string, unknown> = { ...githubPayload };
    if ("pushedAt" in entry.input) payload.pushed_at = entry.input.pushedAt;
    if ("archived" in entry.input) payload.archived = entry.input.archived;
    const get = createMetadataService({ sources, now: () => epoch,
      fetch: async (input) => { calls.push(String(input)); return Response.json(payload); } });
    const result = await get("custom");
    expect(result.github).toStrictEqual(snapshot({ ...githubData, ...entry.expected }));
    expect(result.npm.status).toBe("not_configured");
    expect(await get("custom")).toStrictEqual(result);
    expect(calls).toEqual(["https://api.github.com/repos/react/react"]);
  });

  test(`persisted activity uses identical validation: ${entry.name}`, async () => {
    let fetches = 0;
    let writes = 0;
    const reads: string[][] = [];
    const get = createMetadataService({ sources, now: () => epoch,
      snapshotStore: {
        read: async (...key) => { reads.push(key); return snapshot({ ...githubData, ...entry.input }); },
        write: async () => { writes++; },
      },
      fetch: async () => { fetches++; throw new Error("Fresh snapshot must not fetch"); },
    });
    const result = await get("custom");
    expect(result.github).toStrictEqual(snapshot({ ...githubData, ...entry.expected }));
    expect(result.npm.status).toBe("not_configured");
    expect(await get("custom")).toStrictEqual(result);
    expect(reads).toEqual([["custom", "github", "react/react"]]);
    expect([fetches, writes]).toEqual([0, 0]);
  });
}

for (const activity of [{ pushedAt, archived: true }, { pushedAt: null, archived: false }]) {
  test(`JSON snapshot roundtrip and stale fallback preserve ${JSON.stringify(activity)}`, async () => {
    let clock = epoch;
    let fetches = 0;
    let persisted: string | null = null;
    const writes: unknown[][] = [];
    const snapshotStore: SnapshotStore = {
      read: async () => persisted === null ? null : JSON.parse(persisted),
      write: async (...args) => { writes.push(args); persisted = JSON.stringify(args[3]); },
    };
    const options = { sources, now: () => clock, snapshotStore,
      fetch: async () => {
        fetches++;
        return fetches === 1
          ? Response.json({ ...githubPayload, pushed_at: activity.pushedAt, archived: activity.archived })
          : new Response(null, { status: 429, headers: { "Retry-After": "120" } });
      },
    };
    const get = createMetadataService(options);
    const expected = snapshot({ ...githubData, ...activity });
    expect((await get("custom")).github).toStrictEqual(expected);
    expect(writes).toEqual([["custom", "github", "react/react", expected]]);
    expect(JSON.parse(persisted!)).toStrictEqual(expected);

    const restarted = createMetadataService(options);
    expect((await restarted("custom")).github).toStrictEqual(expected);
    expect(fetches).toBe(1);

    clock += ttl;
    const stale = { ...expected, stale: true, refreshStatus: "rate_limited",
      retryAt: new Date(clock + 120_000).toISOString() };
    expect((await get("custom")).github).toStrictEqual(stale);
    expect((await createMetadataService(options)("custom")).github).toStrictEqual(stale);
    expect(fetches).toBe(3);
    clock += 119_999;
    expect((await get("custom")).github).toStrictEqual(stale);
    expect(fetches).toBe(3);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(persisted!)).toStrictEqual(expected);
  });

  test(`memory-only stale fallback preserves ${JSON.stringify(activity)}`, async () => {
    let clock = epoch;
    let fetches = 0;
    const get = createMetadataService({ sources, now: () => clock,
      fetch: async () => {
        fetches++;
        return fetches === 1
          ? Response.json({ ...githubPayload, pushed_at: activity.pushedAt, archived: activity.archived })
          : new Response(null, { status: 503 });
      },
    });
    const expected = snapshot({ ...githubData, ...activity });
    expect((await get("custom")).github).toStrictEqual(expected);
    clock += ttl;
    expect((await get("custom")).github).toStrictEqual({ ...expected, stale: true, refreshStatus: "unavailable" });
    expect(fetches).toBe(2);
  });
}
