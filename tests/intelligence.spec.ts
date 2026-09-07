import assert from "node:assert/strict";
import test from "node:test";
import { localCatalog } from "../src/data/local-catalog";
import { technologySources } from "../src/data/technology-sources";
import {
  EXPANSION_LIMIT,
  activitySignal,
  dependencyEvidence,
  dependencyExpansion,
  isPackageName,
  recommendations,
} from "../src/lib/intelligence";
import type { Catalog } from "../src/types/catalog";
import type { GitHubMetadata, NpmMetadata, ProviderResult } from "../src/types/metadata";

const fetchedAt = "2026-09-07T12:00:00.000Z";
const baseOk = <T>(data: T): Extract<ProviderResult<T>, { status: "ok" }> => ({ status: "ok", data, fetchedAt });

function npm(name: string, dependencies: Record<string, string> = {}, peerDependencies: Record<string, string> = {}): NpmMetadata {
  return { name, url: `https://www.npmjs.com/package/${name}`, version: "0.0.0-test", description: null,
    license: "MIT", dependencies, peerDependencies };
}

function makeGitHub(overrides: Partial<GitHubMetadata> = {}): GitHubMetadata {
  return { repository: "codeverse-test-only/repo", url: "https://github.com/codeverse-test-only/repo",
    stars: 1, forks: 0, openIssues: 0, language: null, ...overrides };
}

test("isPackageName accepts scoped and standard names, rejects unsafe strings", () => {
  for (const name of ["react", "next", "lodash.debounce", "@angular/core", "@scope/sub-pkg.test"]) {
    assert.equal(isPackageName(name), true, name);
  }
  for (const name of ["", " ", "../evil", "https://example.com/x", "REACT",
    "a".repeat(215), "pkg space", "pkg!name", "@/x", "@bad space/x"]) {
    assert.equal(isPackageName(name), false, JSON.stringify(name));
  }
});

test("dependencyEvidence: empty and not-ok results never produce edges or entries", () => {
  const catalog = localCatalog;
  const id = "react";
  for (const result of [
    { status: "not_configured" as const, message: "no package" },
    { status: "unavailable" as const, message: "down" },
    { status: "timeout" as const, message: "slow" },
    { status: "rate_limited" as const, message: "limited", retryAt: fetchedAt },
  ]) {
    assert.deepEqual(dependencyEvidence(catalog, id, result as ProviderResult<NpmMetadata>), []);
    assert.deepEqual(dependencyExpansion(catalog, id, result as ProviderResult<NpmMetadata>), { edges: [], omitted: 0 });
  }
});

test("dependencyEvidence: matches curated neighbors, separates runtime and peer, ignores non-catalog packages", () => {
  const catalog = localCatalog;
  // React declares "next" (curated runtime), "vue" (curated runtime), "@angular/core" (curated peer),
  // and external "loose-tool" which is not in the catalog.
  const result = baseOk(npm("react",
    { next: "^14.0.0", vue: "^3.0.0", "loose-tool": "^1.0.0" },
    { "@angular/core": ">=17" }));
  const evidence = dependencyEvidence(catalog, "react", result);
  const byName = Object.fromEntries(evidence.map((entry) => [entry.name, entry]));
  assert.deepEqual(Object.keys(byName).sort(), ["@angular/core", "loose-tool", "next", "vue"]);
  for (const entry of evidence) {
    if (entry.targetId) {
      assert.equal(entry.edge?.kind, "dependency");
      assert.equal(entry.edge?.directed, true);
      assert.equal(entry.edge?.provenance, "npm");
      assert.match(entry.edge?.id ?? "", /^npm:react:/);
      assert.match(entry.edge?.explanation ?? "", /declares/);
    } else {
      assert.match(entry.url, /^https:\/\/www\.npmjs\.com\/package\//);
      assert.equal(entry.edge, undefined);
    }
  }
  assert.equal(byName.next?.targetId, "nextjs");
  assert.equal(byName.next?.label, "Runtime dependency");
  assert.equal(byName.next?.range, "^14.0.0");
  assert.equal(byName.vue?.targetId, "vue");
  assert.equal(byName.vue?.label, "Runtime dependency");
  assert.equal(byName["@angular/core"]?.targetId, "angular");
  assert.equal(byName["@angular/core"]?.label, "Peer requirement");
  assert.equal(byName["@angular/core"]?.range, ">=17");
  assert.equal(byName["loose-tool"]?.targetId, undefined);
  assert.equal(byName["loose-tool"]?.url, "https://www.npmjs.com/package/loose-tool");
});

test("dependencyEvidence: combined runtime + peer declares both label and range", () => {
  const catalog = localCatalog;
  const result = baseOk(npm("react", { vue: "^3" }, { vue: "^3" }));
  const [entry] = dependencyEvidence(catalog, "react", result);
  assert.equal(entry?.name, "vue");
  assert.equal(entry?.label, "Dependency and peer requirement");
  assert.equal(entry?.range, "^3 / ^3");
  assert.equal(entry?.targetId, "vue");
});

test("dependencyEvidence: unknown source technology returns no entries even with valid manifest", () => {
  const result = baseOk(npm("next", { vue: "^3" }));
  assert.deepEqual(dependencyEvidence(localCatalog, "missing-tech", result), []);
});

test("dependencyExpansion: dedupes against curated/dependency edges and caps at EXPANSION_LIMIT", () => {
  const base: Catalog = {
    ...localCatalog,
    relationships: [
      ...localCatalog.relationships,
      // Pre-existing directed dependency edge for react -> nextjs; should NOT be duplicated.
      { id: "npm:react:nextjs:pre-existing", source: "react", target: "nextjs", kind: "dependency", directed: true, provenance: "npm" },
    ],
  };
  // Declare curated-neighbor deps. Angular is "@angular/core" in the catalog sources, not "angular".
  // React declaring itself as a dependency must not produce a self-loop edge.
  const dependencies: Record<string, string> = {};
  for (const id of ["next", "vue", "svelte", "react", "@angular/core"]) dependencies[id] = "*";
  const result = baseOk(npm("react", dependencies));
  const expansion = dependencyExpansion(base, "react", result);
  // nextjs is filtered because it is already a directed dependency edge;
  // react is filtered (self); vue/svelte/angular should remain.
  assert.equal(expansion.edges.length, 3);
  assert.equal(expansion.edges.every((edge) => edge.target !== "nextjs"), true);
  assert.equal(expansion.edges.every((edge) => edge.target !== "react"), true);
  const targets = expansion.edges.map((edge) => edge.target).sort();
  assert.deepEqual(targets, ["angular", "svelte", "vue"]);
});

test("dependencyExpansion: many declared dependencies still produce bounded edges and reported omitted count", () => {
  const dependencies: Record<string, string> = {};
  for (let index = 0; index < EXPANSION_LIMIT + 3; index++) {
    // Fake but valid-looking package names that won't match any curated technology.
    dependencies[`unknown-package-${index}`] = "^1.0.0";
  }
  const result = baseOk(npm("react", dependencies));
  const expansion = dependencyExpansion(localCatalog, "react", result);
  assert.equal(expansion.edges.length, 0);
  assert.equal(expansion.omitted, 0);
  // Now declare too many curated-neighbor deps to test the cap. Angular is "@angular/core" in sources.
  const crowded = baseOk(npm("react",
    Object.fromEntries(["next", "vue", "svelte", "@angular/core"].map((id) => [id, "*"]))));
  const capped = dependencyExpansion(localCatalog, "react", crowded);
  assert.equal(capped.edges.length, 4);
  assert.equal(capped.omitted, 0);
});

test("dependencyExpansion: never emits self-loop edges even when manifest declares itself", () => {
  const result = baseOk(npm("react", { react: "*" }));
  const expansion = dependencyExpansion(localCatalog, "react", result);
  assert.equal(expansion.edges.length, 0);
  assert.equal(expansion.omitted, 0);
});

test("recommendations: deterministic, never include the selected technology, explain why", () => {
  const suggestions = recommendations(localCatalog, "react");
  assert.ok(suggestions.length > 0, "react should have at least one recommendation");
  assert.ok(suggestions.length <= 4, "recommendations must be bounded");
  assert.equal(suggestions.find(({ technology }) => technology.id === "react"), undefined);
  // Deterministic: same call returns identical structure.
  const again = recommendations(localCatalog, "react");
  assert.deepEqual(suggestions, again);
  // Scores must be strictly non-increasing.
  for (let index = 1; index < suggestions.length; index++) {
    assert.ok(suggestions[index - 1].score >= suggestions[index].score);
  }
  // Every reason must reference the selected tech and either share-count or curated link.
  for (const { technology, reason } of suggestions) {
    assert.match(reason, /React/);
    assert.ok(reason.includes("ecosystem") || reason.includes("curated"));
    assert.notEqual(technology.id, "react");
  }
});

test("recommendations: returns empty list when the selected technology is unknown", () => {
  assert.deepEqual(recommendations(localCatalog, "missing-tech"), []);
});

test("recommendations: prefers curated neighbors for techs with multiple shared neighbors", () => {
  // Fastapi is curated with postgresql/redis/pytorch/tensorflow/huggingface, all of which share neighbors with react only via nodejs.
  const suggestions = recommendations(localCatalog, "fastapi");
  assert.ok(suggestions.length > 0);
  // Reasons must mention at least one shared neighbor name when applicable.
  assert.ok(suggestions.every(({ reason }) => /Shares \d+ ecosystem/.test(reason) || /curated/i.test(reason)));
});

test("activitySignal: classifies fresh pushes to Active/Quiet/Low Activity and explains the rule", () => {
  const now = Date.parse("2026-09-07T12:00:00Z");
  const cases: Array<{ days: number; expected: string }> = [
    { days: 0, expected: "Active" },
    { days: 30, expected: "Active" },
    { days: 90, expected: "Active" },
    { days: 91, expected: "Quiet" },
    { days: 365, expected: "Quiet" },
    { days: 366, expected: "Low Activity" },
    { days: 3650, expected: "Low Activity" },
  ];
  for (const { days, expected } of cases) {
    const pushedAt = new Date(now - days * 86_400_000).toISOString();
    const signal = activitySignal(baseOk(makeGitHub({ pushedAt })), now);
    assert.equal(signal.label, expected, `days=${days}`);
    assert.match(signal.reason, /Active: 0-90 days/);
    assert.match(signal.reason, /measures recency/);
  }
});

test("activitySignal: returns Archived when GitHub marks the repository archived", () => {
  const now = Date.parse("2026-09-07T12:00:00Z");
  const signal = activitySignal(baseOk(makeGitHub({ pushedAt: new Date(now - 30 * 86_400_000).toISOString(), archived: true })), now);
  assert.equal(signal.label, "Archived");
  assert.match(signal.reason, /archived/);
});

test("activitySignal: returns Unknown and never guesses when pushedAt is missing or invalid", () => {
  const now = Date.parse("2026-09-07T12:00:00Z");
  for (const data of [makeGitHub({ pushedAt: undefined }), makeGitHub({ pushedAt: null }),
    makeGitHub({ pushedAt: "invalid" }), makeGitHub({ pushedAt: "2026-13-40T99:99:99Z" }),
    // Make pushedAt undefined by removing the field, simulating a legacy payload.
    { repository: "codeverse-test-only/repo", url: "https://github.com/codeverse-test-only/repo",
      stars: 1, forks: 0, openIssues: 0, language: null } as GitHubMetadata]) {
    const signal = activitySignal(baseOk(data), now);
    assert.equal(signal.label, "Unknown", JSON.stringify(data));
    assert.match(signal.reason, /(unavailable|invalid|not available|push)/);
  }
});

test("activitySignal: returns Unknown when the snapshot is stale or the result is not ok", () => {
  const now = Date.parse("2026-09-07T12:00:00Z");
  const stale = { ...baseOk(makeGitHub({ pushedAt: new Date(now - 30 * 86_400_000).toISOString() })), stale: true, refreshStatus: "rate_limited" as const };
  assert.equal(activitySignal(stale, now).label, "Unknown");
  assert.match(activitySignal(stale, now).reason, /stale/);
  for (const failure of [
    { status: "unavailable" as const, message: "down" },
    { status: "rate_limited" as const, message: "limited", retryAt: fetchedAt },
    { status: "timeout" as const, message: "slow" },
    { status: "not_configured" as const, message: "missing" },
  ]) {
    assert.equal(activitySignal(failure as ProviderResult<GitHubMetadata>, now).label, "Unknown");
  }
  assert.equal(activitySignal(null, now).label, "Unknown");
});

test("intelligence exports are coherent with the curated sources", () => {
  // Every technology referenced by dependency expansion must be in the catalog; nothing in technologySources is missing.
  for (const id of Object.keys(technologySources)) {
    assert.ok(localCatalog.technologies.some((technology) => technology.id === id), id);
  }
  assert.equal(localCatalog.technologies.length, 17);
  assert.equal(localCatalog.relationships.length, 29);
});