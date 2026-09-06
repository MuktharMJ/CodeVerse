import { expect, test } from "@playwright/test";
import { technologies } from "../src/data/technologies";
import { hasTechnologySource, technologySources } from "../src/data/technology-sources";
import { createMetadataService } from "../src/services/metadata-transport";

const githubPayload = {
  full_name: "react/react", stargazers_count: 123, forks_count: 45,
  open_issues_count: 6, language: "JavaScript", html_url: "https://untrusted.example/",
};
const npmPayload = {
  name: "react", version: "19.2.0", description: "React library", license: "MIT",
  dependencies: { example: "^1.0.0" }, peerDependencies: { other: ">=2" },
};
const epoch = Date.parse("2026-09-07T12:00:00Z");

function transport(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (input, init) => Promise.resolve(handler(String(input), init));
}

test("curated sources cover exactly the catalog and reject prototype IDs", async () => {
  expect(Object.keys(technologySources).sort()).toEqual(technologies.map(({ id }) => id).sort());
  expect(Object.keys(technologySources)).toHaveLength(17);
  expect(Object.values(technologySources).filter((source) => "npm" in source)).toHaveLength(6);
  expect(technologySources.tensorflow.npm).toBe("@tensorflow/tfjs");
  expect(technologySources.tensorflow.npmNote).toContain("JavaScript distribution");
  expect(technologySources.huggingface.github).toBe("huggingface/transformers");
  expect(technologySources.huggingface.githubNote).toContain("representative");
  const getMetadata = createMetadataService({ fetch: transport(() => { throw new Error("Must not fetch"); }) });
  for (const id of ["__proto__", "constructor", "toString", "unknown", "https://example.com", "React"]) {
    expect(hasTechnologySource(id)).toBe(false);
    await expect(getMetadata(id)).rejects.toThrow("Unknown technology ID");
  }
});

test("parses both successes, builds trusted URLs, and sends the token only to GitHub", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const getMetadata = createMetadataService({
    now: () => epoch, githubToken: "private-test-token",
    fetch: transport((url, init) => {
      calls.push({ url, init });
      return Response.json(url.includes("api.github.com") ? githubPayload : npmPayload);
    }),
  });
  const result = await getMetadata("react");
  expect(result).toEqual({
    technologyId: "react",
    github: { status: "ok", fetchedAt: new Date(epoch).toISOString(), data: {
      repository: "react/react", url: "https://github.com/react/react",
      stars: 123, forks: 45, openIssues: 6, language: "JavaScript",
    } },
    npm: { status: "ok", fetchedAt: new Date(epoch).toISOString(), data: {
      ...npmPayload, url: "https://www.npmjs.com/package/react",
    } },
  });
  expect(calls.map(({ url }) => url)).toEqual([
    "https://api.github.com/repos/react/react", "https://registry.npmjs.org/react/latest",
  ]);
  expect(new Headers(calls[0].init?.headers).get("authorization")).toBe("Bearer private-test-token");
  expect(new Headers(calls[1].init?.headers).has("authorization")).toBe(false);
  expect(calls.every(({ init }) => init?.redirect === "error" && init.cache === "no-store")).toBe(true);
});

test("encodes scoped packages and defaults omitted optional npm fields", async () => {
  const urls: string[] = [];
  const getMetadata = createMetadataService({ fetch: transport((url) => {
    urls.push(url);
    return Response.json(url.includes("api.github.com")
      ? { ...githubPayload, full_name: "angular/angular", language: null }
      : { name: "@angular/core", version: "21.0.0" });
  }) });
  const result = await getMetadata("angular");
  expect(urls[1]).toBe("https://registry.npmjs.org/%40angular%2Fcore/latest");
  expect(result.npm).toMatchObject({ status: "ok", data: {
    description: null, license: null, dependencies: {}, peerDependencies: {},
  } });
  expect(result.github).toMatchObject({ status: "ok", data: { language: null } });
});

test("rejects invalid payloads without leaking provider content", async () => {
  for (const payload of [null, [], {}, { ...githubPayload, stargazers_count: -1 },
    { ...githubPayload, forks_count: "45" }, { ...githubPayload, full_name: "wrong/repo" },
    { ...githubPayload, language: {} }]) {
    const result = await createMetadataService({ fetch: transport((url) =>
      Response.json(url.includes("api.github.com") ? payload : npmPayload)) })("react");
    expect(result.github.status).toBe("unavailable");
    expect(result.npm.status).toBe("ok");
  }
  for (const payload of [null, [], {}, { ...npmPayload, name: "wrong" },
    { ...npmPayload, version: "" }, { ...npmPayload, license: {} },
    { ...npmPayload, dependencies: { secret: 123 } }, { ...npmPayload, peerDependencies: [] }]) {
    const result = await createMetadataService({ fetch: transport((url) =>
      Response.json(url.includes("api.github.com") ? githubPayload : payload)) })("react");
    expect(result.github.status).toBe("ok");
    expect(result.npm).toEqual({ status: "unavailable", message: "Provider metadata is currently unavailable." });
  }
});

test("handles malformed JSON and sanitizes network exceptions", async () => {
  const result = await createMetadataService({ githubToken: "secret", fetch: transport((url) => {
    if (url.includes("api.github.com")) throw new Error("Authorization: Bearer secret");
    return new Response("private invalid JSON");
  }) })("react");
  expect(result.github.status).toBe("unavailable");
  expect(result.npm.status).toBe("unavailable");
  expect(JSON.stringify(result)).not.toMatch(/secret|private|Authorization/);
});

test("handles 429 and GitHub 403 limits, caps retry expiry, and distinguishes forbidden", async () => {
  const cases: Array<{ status: number; headers: Record<string, string>; seconds: number }> = [
    { status: 429, headers: { "Retry-After": "120" }, seconds: 120 },
    { status: 429, headers: { "Retry-After": new Date(epoch + 180_000).toUTCString() }, seconds: 180 },
    { status: 403, headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(epoch / 1_000 + 90) }, seconds: 90 },
    { status: 403, headers: { "Retry-After": "999999999" }, seconds: 86400 },
    { status: 403, headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(epoch / 1_000 + 3600) }, seconds: 3600 },
    { status: 429, headers: { "Retry-After": "invalid" }, seconds: 60 },
    { status: 429, headers: { "Retry-After": "0" }, seconds: 1 },
  ];
  for (const entry of cases) {
    const result = await createMetadataService({ now: () => epoch, fetch: transport((url) =>
      url.includes("api.github.com")
        ? Response.json({ message: "secret provider details" }, { status: entry.status, headers: entry.headers })
        : Response.json(npmPayload)) })("react");
    expect(result.github).toEqual({ status: "rate_limited",
      message: "Provider rate limit reached. Try again later.",
      retryAt: new Date(epoch + entry.seconds * 1_000).toISOString(),
    });
    expect(result.npm.status).toBe("ok");
  }
  const result = await createMetadataService({ fetch: transport(() =>
    Response.json({ message: "Forbidden" }, { status: 403 })) })("react");
  expect(result.github.status).toBe("unavailable");
  const secondary = await createMetadataService({ fetch: transport(() =>
    Response.json({ message: "You have exceeded a secondary rate limit." }, { status: 403 })) })("react");
  expect(secondary.github.status).toBe("rate_limited");
});

test("times out after five seconds even while reading a body; keeps the other provider", async () => {
  let signal: AbortSignal | null | undefined;
  const getMetadata = createMetadataService({ fetch: transport((url, init) => {
    if (!url.includes("api.github.com")) return Response.json(npmPayload);
    signal = init?.signal;
    const response = Response.json(githubPayload);
    response.json = () => new Promise(() => {});
    return response;
  }) });
  const result = await getMetadata("react");
  expect(signal?.aborted).toBe(true);
  expect(result.github).toEqual({ status: "timeout", message: "Provider request timed out." });
  expect(result.npm.status).toBe("ok");
});

test("deduplicates in-flight calls and starts providers independently in parallel", async () => {
  let release!: (response: Response) => void;
  const calls: string[] = [];
  const getMetadata = createMetadataService({ fetch: transport((url) => {
    calls.push(url);
    return url.includes("api.github.com") ? new Promise<Response>((resolve) => { release = resolve; })
      : Response.json({ message: "Unavailable" }, { status: 503 });
  }) });
  const first = getMetadata("react");
  const second = getMetadata("react");
  expect(first).toBe(second);
  expect(calls).toHaveLength(2);
  release(Response.json(githubPayload));
  const result = await first;
  expect(result.github.status).toBe("ok");
  expect(result.npm.status).toBe("unavailable");
});

test("caches successes for 15 minutes and failures independently for 60 seconds", async () => {
  let clock = epoch;
  let githubCalls = 0;
  let npmCalls = 0;
  const getMetadata = createMetadataService({ now: () => clock, fetch: transport((url) => {
    if (url.includes("api.github.com")) { githubCalls++; return Response.json(githubPayload); }
    npmCalls++;
    return npmCalls === 1 ? new Response(null, { status: 503 }) : Response.json(npmPayload);
  }) });
  await getMetadata("react");
  clock += 59_999;
  await getMetadata("react");
  expect([githubCalls, npmCalls]).toEqual([1, 1]);
  clock++;
  expect((await getMetadata("react")).npm.status).toBe("ok");
  expect([githubCalls, npmCalls]).toEqual([1, 2]);
  clock = epoch + 900_000;
  await getMetadata("react");
  expect([githubCalls, npmCalls]).toEqual([2, 2]);
  clock += 60_000;
  await getMetadata("react");
  expect([githubCalls, npmCalls]).toEqual([2, 3]);
});

test("rate-limit cache expires at retryAt and unconfigured npm never fetches", async () => {
  let clock = epoch;
  let calls = 0;
  const getMetadata = createMetadataService({ now: () => clock, fetch: transport(() => {
    calls++;
    return new Response(null, { status: 429, headers: { "Retry-After": "120" } });
  }) });
  const result = await getMetadata("nodejs");
  expect(result.npm.status).toBe("not_configured");
  clock += 119_999;
  await getMetadata("nodejs");
  expect(calls).toBe(1);
  clock++;
  await getMetadata("nodejs");
  expect(calls).toBe(2);
});
