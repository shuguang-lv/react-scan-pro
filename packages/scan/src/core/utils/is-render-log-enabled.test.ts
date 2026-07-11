import { describe, expect, it } from "vitest";
import { isRenderLogEnabled } from "./is-render-log-enabled";

describe("isRenderLogEnabled", () => {
  it("preserves boolean notification logging and supports independent options", () => {
    expect(isRenderLogEnabled(true, "notification")).toBe(true);
    expect(isRenderLogEnabled(true, "report")).toBe(false);
    expect(isRenderLogEnabled({ notification: false, report: true }, "notification")).toBe(false);
    expect(isRenderLogEnabled({ notification: false, report: true }, "report")).toBe(true);
  });
});
