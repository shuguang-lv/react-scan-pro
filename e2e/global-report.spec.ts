import path from "node:path";
import { expect, test } from "@playwright/test";

const autoGlobalPath = path.resolve("packages/website/public/auto.global.js");
const fixtureUrl = "http://127.0.0.1:5173/script-report.html";

test.describe("Script tag report API", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/auto.global.js", async (route) => {
      await route.fulfill({ path: autoGlobalPath, contentType: "application/javascript" });
    });
  });

  test("exposes a callable global and completes a summary session", async ({ page }) => {
    await page.goto(fixtureUrl);
    await page.waitForSelector('[data-testid="heading"]');
    await page.waitForFunction(() => typeof window.reactScanPro?.onReport === "function");

    await page.evaluate(() => {
      window.reactScanPro.setOptions({ enabled: false, showToolbar: false });
      (window as typeof window & { __reports?: unknown[] }).__reports = [];
      window.reactScanPro.onReport((report) => {
        (window as typeof window & { __reports?: unknown[] }).__reports?.push(report);
      });
      window.reactScanPro.setOptions({
        enabled: true,
        allowInIframe: true,
        dangerouslyForceRunInProduction: true,
        report: { mode: "summary", limit: 100, sortBy: "renderCount" },
      });
    });

    await page.getByTestId("increment").click();
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.reactScanPro.setOptions({ enabled: false }));

    const result = await page.evaluate(() => {
      const reports = (window as typeof window & { __reports?: unknown[] }).__reports ?? [];
      return {
        isCallable: typeof window.reactScanPro === "function",
        isLegacyAlias: window.reactScan === window.reactScanPro,
        reports,
        lastReport: window.reactScanPro.getLastReport(),
      };
    });
    expect(result.isCallable).toBe(true);
    expect(result.isLegacyAlias).toBe(true);
    expect(result.reports).toHaveLength(1);
    expect(result.lastReport).toEqual(result.reports[0]);
    expect(result.lastReport).toMatchObject({
      mode: "summary",
      metadata: { observedRenderCount: expect.any(Number) },
      components: expect.any(Array),
    });
    expect(result.lastReport?.metadata.observedRenderCount).toBeGreaterThan(0);
    const summary = result.lastReport?.mode === "summary" ? result.lastReport : null;
    expect(
      summary?.components.some((component) =>
        component.reasons.some((reason) => reason.kind === "state"),
      ),
    ).toBe(true);
  });

  test("posts a complete JSON-safe raw report from an iframe", async ({ page }) => {
    await page.setContent(`<iframe src="${fixtureUrl}" title="fixture"></iframe>`);
    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
    expect(frame).toBeDefined();
    await frame?.waitForSelector('[data-testid="heading"]');
    await frame?.waitForFunction(() => typeof window.reactScanPro?.onReport === "function");

    await page.evaluate(() => {
      (window as typeof window & { __iframeReport?: unknown }).__iframeReport = undefined;
      window.addEventListener("message", (event) => {
        if (event.data?.type === "react-scan-pro:report") {
          (window as typeof window & { __iframeReport?: unknown }).__iframeReport =
            event.data.report;
        }
      });
    });
    await frame?.evaluate(() => {
      window.reactScanPro.setOptions({ enabled: false, showToolbar: false });
      window.reactScanPro.onReport((report) => {
        window.parent.postMessage({ type: "react-scan-pro:report", report }, "*");
      });
      window.reactScanPro.setOptions({
        enabled: true,
        allowInIframe: true,
        dangerouslyForceRunInProduction: true,
        report: { mode: "raw", maxRecords: 100 },
      });
    });

    await frame?.getByTestId("increment").click();
    await frame?.waitForTimeout(1000);
    await frame?.evaluate(() => window.reactScanPro.setOptions({ enabled: false }));
    await page.waitForFunction(
      () => (window as typeof window & { __iframeReport?: unknown }).__iframeReport !== undefined,
    );

    const report = await page.evaluate(
      () => (window as typeof window & { __iframeReport?: unknown }).__iframeReport,
    );
    expect(report).toMatchObject({
      mode: "raw",
      metadata: { observedRenderCount: expect.any(Number) },
      renders: expect.any(Array),
    });
    expect(
      (report as { metadata: { observedRenderCount: number } }).metadata.observedRenderCount,
    ).toBeGreaterThan(0);
  });
});
