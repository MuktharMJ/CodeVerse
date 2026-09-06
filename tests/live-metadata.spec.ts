import { test, expect } from "@playwright/test";
import type { MetadataResponse } from "../src/types/metadata";

test("optional real provider smoke check through the Next.js API", async ({ request }) => {
  test.skip(process.env.CODEVERSE_LIVE_METADATA !== "1", "Opt in explicitly to contact GitHub and npm.");
  const response = await request.get("/api/technologies/react");
  expect(response.status()).toBe(200);
  const data: MetadataResponse = await response.json();
  expect(data.technologyId).toBe("react");
  console.log(`Real metadata: GitHub=${data.github.status}, npm=${data.npm.status}`);
  expect([data.github.status, data.npm.status]).toContain("ok");
  if (data.github.status === "ok") {
    expect(data.github.data.repository).toBe("react/react");
    expect(data.github.data.stars).toBeGreaterThan(0);
  }
  if (data.npm.status === "ok") { expect(data.npm.data.name).toBe("react"); expect(data.npm.data.version).toMatch(/^\d+\./); }
});
