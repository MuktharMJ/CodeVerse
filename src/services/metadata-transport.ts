import { hasTechnologySource, technologySources } from "../data/technology-sources";
import type { GitHubMetadata, MetadataResponse, NpmMetadata, ProviderResult } from "../types/metadata";

const SUCCESS_TTL = 15 * 60_000;
const FAILURE_TTL = 60_000;
const TIMEOUT = 5_000;
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

type CacheEntry<T> = { result: ProviderResult<T>; expiresAt: number };

// No environment reads or server-only guard here: tests supply their own transport and clock.
export function createMetadataService(options: {
  fetch?: typeof fetch;
  now?: () => number;
  githubToken?: string;
} = {}) {
  const fetcher = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = options.now ?? Date.now;
  type Id = keyof typeof technologySources;
  const githubCache = new Map<Id, CacheEntry<GitHubMetadata>>();
  const npmCache = new Map<Id, CacheEntry<NpmMetadata>>();
  const inFlight = new Map<Id, Promise<MetadataResponse>>();

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

  async function cached<T>(id: Id, cache: Map<Id, CacheEntry<T>>, load: () => Promise<ProviderResult<T>>): Promise<ProviderResult<T>> {
    const existing = cache.get(id);
    if (existing && existing.expiresAt > now()) return existing.result;
    const result = await load();
    const expiresAt = result.status === "ok" ? now() + SUCCESS_TTL
      : result.status === "rate_limited" && result.retryAt ? Date.parse(result.retryAt)
      : now() + FAILURE_TTL;
    cache.set(id, { result, expiresAt });
    return result;
  }

  return function getMetadata(id: string): Promise<MetadataResponse> {
    // Check before touching maps so arbitrary input cannot grow caches or in-flight state.
    if (!hasTechnologySource(id)) return Promise.reject(new RangeError("Unknown technology ID"));
    const pending = inFlight.get(id);
    if (pending) return pending;
    const source: { github: string; npm?: string } = technologySources[id];
    const githubHeaders: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "codeverse-metadata",
    };
    if (options.githubToken) githubHeaders.Authorization = `Bearer ${options.githubToken}`;
    const operation = Promise.all([
      cached(id, githubCache, () => request(
        `https://api.github.com/repos/${source.github.split("/").map(encodeURIComponent).join("/")}`,
        githubHeaders, (value) => parseGitHub(value, source.github),
      )),
      cached(id, npmCache, () => source.npm
        ? request(`https://registry.npmjs.org/${encodeURIComponent(source.npm)}/latest`,
          { Accept: "application/json" }, (value) => parseNpm(value, source.npm!))
        : Promise.resolve({ status: "not_configured", message: "No npm package is curated for this technology." })),
    ]).then(([github, npm]): MetadataResponse => ({ technologyId: id, github, npm }))
      .finally(() => { inFlight.delete(id); });
    inFlight.set(id, operation);
    return operation;
  };
}
