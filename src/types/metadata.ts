export type ProviderFailureStatus = "unavailable" | "rate_limited" | "timeout" | "not_configured";

export type ProviderResult<T> =
  | {
      status: "ok";
      data: T;
      fetchedAt: string;
      stale?: boolean;
      refreshStatus?: ProviderFailureStatus;
      retryAt?: string;
    }
  | {
      status: ProviderFailureStatus;
      message: string;
      retryAt?: string;
    };

export interface GitHubMetadata {
  repository: string;
  url: string;
  stars: number;
  forks: number;
  openIssues: number;
  language: string | null;
  pushedAt?: string | null;
  archived?: boolean;
}

export interface NpmMetadata {
  name: string;
  url: string;
  version: string;
  description: string | null;
  license: string | null;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
}

export interface MetadataResponse {
  technologyId: string;
  github: ProviderResult<GitHubMetadata>;
  npm: ProviderResult<NpmMetadata>;
}
