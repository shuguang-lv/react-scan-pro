import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:5173";
const fixtureUrl = `${origin}/script-report.html`;
const autoGlobalPath = path.resolve("packages/website/public/auto.global.js");

test.describe("Session report panel", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
    await page.route("**/auto.global.js", async (route) => {
      await route.fulfill({ path: autoGlobalPath, contentType: "application/javascript" });
    });
    await page.goto(fixtureUrl);
    await page.waitForSelector('[data-testid="heading"]');

    await page.evaluate(() => {
      window.reactScanPro.setOptions({
        enabled: true,
        showToolbar: true,
        dangerouslyForceRunInProduction: true,
        report: { mode: "summary", limit: 100 },
      });
    });
    await page.getByTestId("increment").click();
    await page.waitForTimeout(100);
    await page.evaluate(() => window.reactScanPro.setOptions({ enabled: false }));
    await page.locator("#react-scan-pro-reports").click();
  });

  test("browses the completed summary and copies its JSON", async ({ page }) => {
    await expect(page.getByTestId("session-reports-panel")).toBeVisible();
    await expect(page.getByTestId("summary-report-list")).toContainText("ScriptReportCounter");

    await page.getByTestId("copy-session-report").click();
    await expect(page.getByTestId("copy-session-report")).toContainText("Copied");
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    const report = JSON.parse(clipboard) as { mode: string; components: unknown[] };
    expect(report.mode).toBe("summary");
    expect(report.components.length).toBeGreaterThan(0);
  });

  test("exports the exact report as a JSON file", async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-session-report").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^react-scan-pro-scan-.*\.json$/);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const report = JSON.parse(await readFile(downloadPath!, "utf8")) as {
      mode: string;
      metadata: { observedRenderCount: number };
    };
    expect(report.mode).toBe("summary");
    expect(report.metadata.observedRenderCount).toBeGreaterThan(0);
  });
});
