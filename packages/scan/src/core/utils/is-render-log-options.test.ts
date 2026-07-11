import { describe, expect, it } from "vitest";
import { isRenderLogOptions } from "./is-render-log-options";

describe("isRenderLogOptions", () => {
  it("accepts only notification and report boolean fields", () => {
    expect(isRenderLogOptions({ notification: true, report: false })).toBe(true);
    expect(isRenderLogOptions({})).toBe(true);
    expect(isRenderLogOptions({ notification: "true" })).toBe(false);
    expect(isRenderLogOptions({ other: true })).toBe(false);
    expect(isRenderLogOptions([])).toBe(false);
  });
});
