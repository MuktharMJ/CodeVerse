import { technologySources } from "../data/technology-sources";
import type { GitHubMetadata, MetadataResponse, NpmMetadata, ProviderResult } from "../types/metadata";

const SUCCESS_TTL = 15 * 60_000;
const FAILURE_TTL = 60_000;
const TIMEOUT = 5_000;
const SNAPSHOT_TIMEOUT = 1_000;
const MAX_RETRY = 24 * 60 * 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function stringRecord(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value) || !Object.values(value).every((entry) => typeof entry === "string")) {
    throw new Error("Invalid dependency map");
  }
  return Object.fromEntries(Object.entries(value)) as Record<string, string>;
}

function parseGitHub(value: unknown, repository: string): GitHubMetadata {
  if (
    !isRecord(value) || typeof value.full_name !== "string" ||
    value.full_name.toLowerCase() !== repository.toLowerCase() ||
    !isCount(value.stargazers_count) || !isCount(value.forks_count) ||
    !isCount(value.open_issues_count) || !isNullableString(value.language)
  ) throw new Error("Invalid GitHub metadata");

  return {
    repository,
    url: `https://github.com/${repository}`,
    stars: value.stargazers_count,
    forks: value.forks_count,
    openIssues: value.open_issues_count,
    language: value.language,
  };
}

function parseNpm(value: unknown, name: string): NpmMetadata {
  if (
    !isRecord(value) || value.name !== name ||
    typeof value.version !== "string" || !value.version.trim() ||
    (value.description !== undefined && !isNullableString(value.description)) ||
    (value.license !== undefined && !isNullableString(value.license))
  ) throw new Error("Invalid npm metadata");

  return {
    name,
    url: `https://www.npmjs.com/package/${name}`,
    version: value.version,
    description: value.description ?? null,
    license: value.license ?? null,
    dependencies: stringRecord(value.dependencies),
    peerDependencies: stringRecord(value.peerDependencies),
  };
}

function retryAt(headers: Headers, now: number): string {
  const retry = headers.get("retry-after");
  const reset = headers.get("x-ratelimit-reset");
  let expiry = NaN;
  if (retry !== null) {
    expiry = /^\d+(\.\d+)?$/.test(retry.trim())
      ? now + Number(retry) * 1_000
      : Date.parse(retry);
  }
  if (!Number.isFinite(expiry) && reset !== null && /^\d+(\.\d+)?$/.test(reset.trim())) {
    expiry = Number(reset) * 1_000;
  }
  const delay = Number.isFinite(expiry) ? expiry - now : FAILURE_TTL;
  return new Date(now + Math.max(1_000, Math.min(MAX_RETRY, delay))).toISOString();
}

type Provider = "github" | "npm";
type Success<T> = Extract<ProviderResult<T>, { status: "ok" }>;
type Source = { github?: string; npm?: string };
type CacheEntry<T> = { sourceKey: string; result: ProviderResult<T>; expiresAt: number };

export interface SnapshotStore {
  read(id: string, provider: Provider, sourceKey: string): Promise<ProviderResult<unknown> | null>;
  write(id: string, provider: Provider, sourceKey: string, result: Success<unknown>): Promise<void>;
}

function parseGitHubSnapshot(value: unknown, repository: string): GitHubMetadata {
  if (!isRecord(value) || value.repository !== repository || value.url !== `https://github.com/${repository}`) {
    throw new Error("Invalid GitHub snapshot");
  }
  return parseGitHub({
    full_name: value.repository, stargazers_count: value.stars, forks_count: value.forks,
    open_issues_count: value.openIssues, language: value.language,
  }, repository);
}

function parseNpmSnapshot(value: unknown, name: string): NpmMetadata {
  if (!isRecord(value) || value.url !== `https://www.npmjs.com/package/${name}` ||
    !isNullableString(value.description) || !isNullableString(value.license) ||
    !isRecord(value.dependencies) || !isRecord(value.peerDependencies)) {
    throw new Error("Invalid npm snapshot");
  }
  return parseNpm(value, name);
}

// Store failures must never prevent provider access, including stores that throw synchronously or hang.
async function snapshotOperation<T>(operation: () => Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), SNAPSHOT_TIMEOUT); }),
      operation(),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// No environment reads or server-only guard here: tests supply their own transport and clock.
export function createMetadataService(options: {
  fetch?: typeof fetch;
  now?: () => number;
  githubToken?: string;
  sources?: Record<string, Source>;
  snapshotStore?: SnapshotStore;
} = {}) {
  const fetcher = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = options.now ?? Date.now;
  const sources: Record<string, Source> = options.sources ?? technologySources;
  const githubCache = new Map<string, CacheEntry<GitHubMetadata>>();
  const npmCache = new Map<string, CacheEntry<NpmMetadata>>();
  const inFlight = new Map<string, { sourceKey: string; promise: Promise<MetadataResponse> }>();

  async function request<T>(url: string, headers: Record<string, string>, parse: (value: unknown) => T): Promise<ProviderResult<T>> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error("Metadata request timed out"));
      }, TIMEOUT);
    });

    try {
      // Race the entire operation, including body parsing, not just the response headers.
      return await Promise.race([timeout, (async (): Promise<ProviderResult<T>> => {
        const response = await fetcher(url, {
          headers, signal: controller.signal, redirect: "error", cache: "no-store",
        });
        if (!response.ok) {
          let limited = response.status === 429 || (response.status === 403 && (
            response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")
          ));
          if (response.status === 403 && !limited) {
            const body: unknown = await response.json().catch(() => null);
            limited = isRecord(body) && typeof body.message === "string" && /rate limit/i.test(body.message);
          }
          return limited
            ? { status: "rate_limited", message: "Provider rate limit reached. Try again later.", retryAt: retryAt(response.headers, now()) }
            : { status: "unavailable", message: "Provider metadata is currently unavailable." };
        }
        const body: unknown = await response.json();
        return { status: "ok", data: parse(body), fetchedAt: new Date(now()).toISOString() };
      })()]);
    } catch {
      return timedOut
        ? { status: "timeout", message: "Provider request timed out." }
        : { status: "unavailable", message: "Provider metadata is currently unavailable." };
    } finally {
      clearTimeout(timer);
      // Release unread error bodies as well as requests that outlive the timeout.
      controller.abort();
    }
  }

  async function cached<T>(
    id: string, provider: Provider, sourceKey: string | undefined, cache: Map<string, CacheEntry<T>>,
    parse: (value: unknown) => T, load: () => Promise<ProviderResult<T>>,
  ): Promise<ProviderResult<T>> {
    if (!sourceKey) return { status: "not_configured", message: `No ${provider === "github" ? "GitHub repository" : "npm package"} is curated for this technology.` };
    const existing = cache.get(id);
    const matching = existing?.sourceKey === sourceKey ? existing : undefined;
    if (matching && matching.expiresAt > now()) return matching.result;
    let lastGood = matching?.result.status === "ok" ? matching.result : null;
    const store = options.snapshotStore;
    if (store) {
      const stored: unknown = await snapshotOperation(() => store.read(id, provider, sourceKey));
      try {
        if (isRecord(stored) && stored.status === "ok" && typeof stored.fetchedAt === "string") {
          const fetchedAt = Date.parse(stored.fetchedAt);
          if (Number.isFinite(fetchedAt) && fetchedAt >= 0 && fetchedAt <= now()) {
            const snapshot: Success<T> = { status: "ok", data: parse(stored.data), fetchedAt: stored.fetchedAt };
            if (!lastGood || fetchedAt >= Date.parse(lastGood.fetchedAt)) lastGood = snapshot;
          }
        }
      } catch {
        // Persisted JSON is untrusted; malformed snapshots are cache misses, not provider failures.
      }
      if (lastGood && Date.parse(lastGood.fetchedAt) + SUCCESS_TTL > now()) {
        cache.set(id, { sourceKey, result: lastGood, expiresAt: Date.parse(lastGood.fetchedAt) + SUCCESS_TTL });
        return lastGood;
      }
    }
    const refreshed = await load();
    const expiresAt = refreshed.status === "ok" ? Date.parse(refreshed.fetchedAt) + SUCCESS_TTL
      : refreshed.status === "rate_limited" && refreshed.retryAt ? Date.parse(refreshed.retryAt)
      : now() + FAILURE_TTL;
    const result: ProviderResult<T> = refreshed.status !== "ok" && lastGood
      ? { status: "ok", data: lastGood.data, fetchedAt: lastGood.fetchedAt,
        stale: true, refreshStatus: refreshed.status,
        ...(refreshed.retryAt ? { retryAt: refreshed.retryAt } : {}) }
      : refreshed;
    cache.set(id, { sourceKey, result, expiresAt });
    if (store && refreshed.status === "ok") {
      await snapshotOperation(() => store.write(id, provider, sourceKey, refreshed));
    }
    return result;
  }

  return function getMetadata(id: string): Promise<MetadataResponse> {
    // Check before touching maps so arbitrary input cannot grow caches or in-flight state.
    if (!Object.prototype.hasOwnProperty.call(sources, id)) return Promise.reject(new RangeError("Unknown technology ID"));
    const source = { ...sources[id] };
    if ((source.github !== undefined && (typeof source.github !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/.test(source.github))) ||
      (source.npm !== undefined && (typeof source.npm !== "string" || source.npm.length > 214 ||
      !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(source.npm)))) {
      return Promise.reject(new RangeError("Invalid technology source"));
    }
    const sourceKey = JSON.stringify([source.github, source.npm]);
    const pending = inFlight.get(id);
    if (pending?.sourceKey === sourceKey) return pending.promise;
    const githubHeaders: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "codeverse-metadata",
    };
    if (options.githubToken) githubHeaders.Authorization = `Bearer ${options.githubToken}`;
    const operation = Promise.all([
      cached(id, "github", source.github, githubCache, (value) => parseGitHubSnapshot(value, source.github!), () => request(
        `https://api.github.com/repos/${source.github!.split("/").map(encodeURIComponent).join("/")}`,
        githubHeaders, (value) => parseGitHub(value, source.github!),
      )),
      cached(id, "npm", source.npm, npmCache, (value) => parseNpmSnapshot(value, source.npm!), () =>
        request(`https://registry.npmjs.org/${encodeURIComponent(source.npm!)}/latest`,
          { Accept: "application/json" }, (value) => parseNpm(value, source.npm!))),
    ]).then(([github, npm]): MetadataResponse => ({ technologyId: id, github, npm }))
      .finally(() => { if (inFlight.get(id)?.promise === operation) inFlight.delete(id); });
    inFlight.set(id, { sourceKey, promise: operation });
    return operation;
  };
}
