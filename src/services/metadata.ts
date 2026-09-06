import "server-only";

import { createMetadataService } from "./metadata-transport";

export const getTechnologyMetadata = createMetadataService({
  githubToken: process.env.GITHUB_TOKEN,
});
