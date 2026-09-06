"use client";

import { useEffect, useState } from "react";
import type { MetadataResponse, ProviderResult } from "@/types/metadata";
import { hasTechnologySource, technologySources } from "@/data/technology-sources";

const cache = new Map<string, { expires: number; promise: Promise<MetadataResponse> }>();
function loadMetadata(id: string) {
  const existing = cache.get(id);
  if (existing && existing.expires > Date.now()) return existing.promise;
  const promise = fetch(`/api/technologies/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(12_000) })
    .then(async (response): Promise<MetadataResponse> => {
      if (!response.ok) throw new Error("Metadata unavailable");
      const data: MetadataResponse = await response.json();
      if (data.technologyId !== id || !data.github || !data.npm) throw new Error("Invalid metadata response");
      const entry = cache.get(id);
      if (entry) entry.expires = Date.now() + (data.github.status === "ok" && ["ok", "not_configured"].includes(data.npm.status) ? 15 * 60_000 : 60_000);
      return data;
    }).catch((error: unknown) => { cache.delete(id); throw error; });
  cache.set(id, { expires: Date.now() + 15_000, promise });
  return promise;
}

function ProviderNotice({ result }: { result: Exclude<ProviderResult<unknown>, { status: "ok" }> }) {
  return <p className="metadata-notice" role="status">{result.message}{result.retryAt && <span>Retry after {new Date(result.retryAt).toLocaleTimeString()}.</span>}</p>;
}

// Keyed by technology in the inspector, so a late response never replaces another node's data.
export function TechnologyMetadata({ id }: { id: string }) {
  const [data, setData] = useState<MetadataResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadMetadata(id).then((result) => { if (active) { setData(result); setFailed(false); } }, () => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [id, attempt]);
  const source: { github?: string; githubNote?: string; npmNote?: string } = hasTechnologySource(id) ? technologySources[id] : {};
  return <section className="metadata-section" aria-label="Software metadata">
    <h3 className="section-label">SIGNALS FROM THE ECOSYSTEM</h3>
    {!data && !failed && <p className="metadata-loading" role="status">Retrieving GitHub and package signals...</p>}
    {failed && <div className="metadata-notice" role="status">External signals are unavailable. Curated technology details and connections remain available.<button className="metadata-retry" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>Retry metadata</button></div>}
    {data && <>
      <div className="metadata-provider"><h4>GitHub <span>Repository</span></h4>
        {data.github.status === "ok" ? <>
          <a className="metadata-link" href={data.github.data.url} target="_blank" rel="noopener noreferrer">{data.github.data.repository} <span aria-hidden="true">↗</span></a>
          <dl className="metadata-stats"><div><dt>Stars</dt><dd>{data.github.data.stars.toLocaleString()}</dd></div><div><dt>Forks</dt><dd>{data.github.data.forks.toLocaleString()}</dd></div><div><dt>Open issues*</dt><dd>{data.github.data.openIssues.toLocaleString()}</dd></div></dl>
          <p className="metadata-caption">{data.github.data.language ?? "Language not reported"} / *Includes pull requests</p>
          <p className="metadata-fetched">Retrieved {new Date(data.github.fetchedAt).toLocaleString()}</p>
        </> : <ProviderNotice result={data.github} />}
        {source.githubNote && <p className="metadata-caption">{source.githubNote}</p>}
      </div>
      <div className="metadata-provider"><h4>npm <span>Latest package</span></h4>
        {data.npm.status === "ok" ? <>
          <a className="metadata-link" href={data.npm.data.url} target="_blank" rel="noopener noreferrer">{data.npm.data.name} <span>v{data.npm.data.version} ↗</span></a>
          <p className="metadata-caption">License: {data.npm.data.license ?? "Not reported"}</p>
          {([['Dependencies', data.npm.data.dependencies], ['Peer dependencies', data.npm.data.peerDependencies]] as const).map(([label, entries]) => <details className="package-dependencies" key={label}><summary>{label}<span>{Object.keys(entries).length}</span></summary><ul>{Object.entries(entries).map(([name, version]) => <li key={name}><span>{name}</span><code>{version}</code></li>)}</ul>{!Object.keys(entries).length && <p className="metadata-caption">None declared in the latest manifest.</p>}</details>)}
          <p className="metadata-fetched">Retrieved {new Date(data.npm.fetchedAt).toLocaleString()}</p>
        </> : <ProviderNotice result={data.npm} />}
        {source.npmNote && <p className="metadata-caption">{source.npmNote}</p>}
      </div>
      {(data.github.status !== "ok" || !["ok", "not_configured"].includes(data.npm.status)) && <p className="metadata-caption">Local descriptions and curated connections remain available. Provider failures are retried on revisit after their cache expires.</p>}
    </>}
  </section>;
}
