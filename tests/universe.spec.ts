import { test, expect } from "@playwright/test";
import { connections, getConnectedIds, technologies, technologyById } from "../src/data/technologies";

test("technology graph has unique, valid nodes and undirected relationships", () => {
  expect(technologies).toHaveLength(17);
  expect(new Set(technologies.map((technology) => technology.id)).size).toBe(17);
  expect(new Set(connections.map((edge) => [...edge].sort().join(":"))).size).toBe(connections.length);
  for (const [a, b] of connections) {
    expect(technologyById[a]).toBeDefined();
    expect(technologyById[b]).toBeDefined();
    expect(a).not.toBe(b);
    expect(getConnectedIds(a)).toContain(b);
    expect(getConnectedIds(b)).toContain(a);
  }
  for (const technology of technologies) expect(getConnectedIds(technology.id).length).toBeGreaterThan(0);
});

test("desktop universe renders and supports exploration", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".live-dot")).toHaveClass(/is-live/);
  await expect(page.locator(".node-target")).toHaveCount(17);
  await expect(page.getByRole("heading", { name: "CODEVERSE", exact: true })).toBeVisible();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: testInfo.outputPath("desktop-universe.png") });

  const react = page.locator(".node-target").filter({ has: page.locator(".node-label", { hasText: "React" }) });
  const initialPosition = await react.boundingBox();
  await react.hover();
  await expect(page.getByRole("complementary", { name: "React preview" })).toBeVisible();
  await react.click();
  await expect(page.locator(".selected-title")).toHaveText("React");
  await expect(react).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".connected-button")).toHaveCount(getConnectedIds("react").length);
  await page.waitForTimeout(1800);
  const focusedPosition = await react.boundingBox();
  expect(Math.abs(focusedPosition!.x - initialPosition!.x) + Math.abs(focusedPosition!.y - initialPosition!.y)).toBeGreaterThan(20);
  await page.screenshot({ path: testInfo.outputPath("desktop-react-focus.png") });
  await page.locator(".connected-button").filter({ hasText: "Next.js" }).click();
  await expect(page.locator(".selected-title")).toHaveText("Next.js");
  await page.getByRole("button", { name: "Back to universe", exact: true }).click();
  await expect(page.locator(".selected-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "AI & ML 4" }).click();
  await expect(page.locator(".node-target.is-dimmed")).toHaveCount(13);
  await page.getByRole("button", { name: "Reset view and return to universe" }).click();
  await expect(page.locator(".node-target.is-dimmed")).toHaveCount(0);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.getByRole("button", { name: "Automatic rotation" }).click();
  await expect(page.getByRole("button", { name: "Automatic rotation" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Automatic rotation" }).click();
  await page.getByRole("button", { name: "Show exploration controls and help" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("combobox", { name: "Search technologies" }).focus();
  await expect(page.getByRole("listbox")).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile layout and touch-friendly directory", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".live-dot")).toHaveClass(/is-live/);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: testInfo.outputPath("mobile-universe.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const node of await page.locator(".node-target").all()) {
    const box = await node.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y).toBeGreaterThan(285);
    expect(box!.y + box!.height).toBeLessThan(690);
  }
  await page.getByRole("button", { name: "Browse technologies" }).click();
  await page.locator(".directory-grid button").filter({ hasText: "PyTorch" }).click();
  await expect(page.locator(".selected-title")).toHaveText("PyTorch");
  await page.waitForTimeout(1800);
  await page.screenshot({ path: testInfo.outputPath("mobile-pytorch-focus.png") });
  const panel = await page.locator(".selected-panel").boundingBox();
  expect(panel!.x).toBeGreaterThanOrEqual(0);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(390);
  await page.locator(".connected-button").filter({ hasText: "JAX" }).click();
  await expect(page.locator(".selected-title")).toHaveText("JAX");
  await page.getByRole("button", { name: "Back to universe", exact: true }).click();
  await expect(page.locator(".selected-panel")).toHaveCount(0);
});

test("reduced-motion preference disables automatic motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".live-dot")).toHaveClass(/is-live/);
  await expect(page.getByRole("button", { name: "Automatic rotation" })).toBeDisabled();
  await page.getByRole("button", { name: "Browse technologies" }).click();
  await page.locator(".directory-grid button").filter({ hasText: "React" }).click();
  await expect(page.locator(".selected-title")).toHaveText("React");
});

test("WebGL failure keeps the directory usable", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof getContext>) {
      if (String(args[0]).includes("webgl")) return null;
      return getContext.apply(this, args);
    } as typeof getContext;
  });
  await page.goto("/");
  await expect(page.getByText("DIRECTORY MODE", { exact: true })).toBeVisible();
  await expect(page.locator(".technology-directory")).toBeVisible();
  await page.locator(".directory-grid button").filter({ hasText: "React" }).click();
  await expect(page.locator(".selected-title")).toHaveText("React");
  await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeDisabled();
});
