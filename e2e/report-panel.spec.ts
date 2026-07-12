import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { decode } from "@toon-format/toon";
import { gotoFixture, outlineToggle, TOOLBAR_SELECTORS } from "./helpers";

const origin = "http://localhost:5173";
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

  test("browses the completed summary and copies its TOON", async ({ page }) => {
    await expect(page.getByTestId("session-reports-panel")).toBeVisible();
    await expect(page.getByTestId("summary-report-list")).toContainText("ScriptReportCounter");

    await page.getByTestId("copy-session-report").click();
    await expect(page.getByTestId("copy-session-report")).toHaveAttribute("title", "Report copied");
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    const report = decode(clipboard);
    if (Array.isArray(report) || report === null || typeof report !== "object") {
      throw new Error("Expected a TOON report object");
    }
    expect(report.mode).toBe("summary");
    expect(Array.isArray(report.components)).toBe(true);
    if (!Array.isArray(report.components)) throw new Error("Expected component summaries");
    expect(report.components.length).toBeGreaterThan(0);
  });

  test("switches to the component tree and focuses a subtree", async ({ page }) => {
    const summaryRow = page.locator(
      '[data-testid="summary-report-row"][data-component-name="ScriptReportCounter"]',
    );
    const summaryRenderCount = await summaryRow.getAttribute("data-render-count");
    expect(summaryRenderCount).not.toBeNull();
    await page.getByTitle("Show tree view").click();

    await expect(page.getByTestId("summary-report-tree")).toContainText("ScriptReportCounter");
    const renderedTreeRow = page.locator('[data-component-name="ScriptReportCounter"]');
    await expect(renderedTreeRow).toHaveAttribute("data-render-count", summaryRenderCount ?? "");
    await expect(renderedTreeRow).not.toHaveAttribute("data-render-count", "0");
    await expect(renderedTreeRow).not.toHaveAttribute("data-self-time", "0");
    await expect(renderedTreeRow).not.toHaveAttribute("data-subtree-time", "0");
    await page.getByText("ScriptReportCounter", { exact: true }).click();
    await expect(page.getByTitle("Show full component tree")).toBeVisible();
  });

  test("highlights a component DOM element on row hover", async ({ page }) => {
    await page.evaluate(() => {
      CanvasRenderingContext2D.prototype.rect = () => {
        const currentCount = Number(document.documentElement.dataset.reportHighlightRectCount ?? 0);
        document.documentElement.dataset.reportHighlightRectCount = String(currentCount + 1);
      };
    });

    await page.getByText("ScriptReportCounter").hover();

    await expect
      .poll(() =>
        page.evaluate(() => Number(document.documentElement.dataset.reportHighlightRectCount ?? 0)),
      )
      .toBeGreaterThan(0);
  });

  test("exports the exact report as a TOON file", async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-session-report").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^react-scan-pro-scan-.*\.toon$/);
    const downloadPath = await download.path();
    if (!downloadPath) throw new Error("Expected a downloaded TOON report");
    const report = decode(await readFile(downloadPath, "utf8"));
    if (Array.isArray(report) || report === null || typeof report !== "object") {
      throw new Error("Expected a TOON report object");
    }
    expect(report.mode).toBe("summary");
    if (
      Array.isArray(report.metadata) ||
      report.metadata === null ||
      typeof report.metadata !== "object"
    ) {
      throw new Error("Expected report metadata");
    }
    expect(report.metadata.observedRenderCount).toBeGreaterThan(0);
  });

  test("clears the completed report", async ({ page }) => {
    await page.getByTestId("clear-session-report").click();

    await expect(page.getByText("No completed session report")).toBeVisible();
    await expect(page.getByTestId("copy-session-report")).toBeDisabled();
    await expect(page.getByTestId("export-session-report")).toBeDisabled();
    await expect(page.getByTestId("clear-session-report")).toBeDisabled();
  });
});

test.describe("Toolbar session reports", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFixture(page);
  });

  test("captures a default summary when the panel enables reporting", async ({ page }) => {
    await page.locator("#react-scan-pro-reports").click();
    await expect(page.getByTestId("session-reports-panel")).toBeVisible();

    await page.getByTestId("increment").click();
    await outlineToggle(page).click();

    await expect(page.getByTestId("summary-report-list")).toContainText("Counter");
  });

  test("switches directly between reports and notifications", async ({ page }) => {
    await page.locator("#react-scan-pro-reports").click();
    await expect(page.getByTestId("session-reports-panel")).toBeVisible();

    await page.locator(TOOLBAR_SELECTORS.notificationsButton).click();
    await expect(page.locator(`${TOOLBAR_SELECTORS.widget} >> text=History`).first()).toBeVisible();
    await expect(page.getByTestId("session-reports-panel")).toHaveCount(0);

    await page.locator("#react-scan-pro-reports").click();
    await expect(page.getByTestId("session-reports-panel")).toBeVisible();
    await expect(page.locator(`${TOOLBAR_SELECTORS.widget} >> text=History`)).toHaveCount(0);
  });
});

test.describe("Toolbar report callback", () => {
  test("finishes the configured session when scanning is disabled", async ({ page }) => {
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
        report: {
          mode: "summary",
          onComplete: (report) => console.log("report-callback", report.components.length),
        },
      });
    });
    await page.getByTestId("increment").click();

    const callbackMessage = page.waitForEvent("console", {
      predicate: (message) => message.text().startsWith("report-callback "),
    });
    await outlineToggle(page).click();

    const message = await callbackMessage;
    expect(Number(message.text().split(" ").at(-1))).toBeGreaterThan(0);
  });
});
