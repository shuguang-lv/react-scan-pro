import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  scan: vi.fn(),
  setOptions: vi.fn(),
  getOptions: vi.fn(),
  onReport: vi.fn(() => vi.fn()),
  getLastReport: vi.fn(),
}));

vi.mock("bippy", () => ({}));
vi.mock("~web/utils/constants", () => ({ IS_CLIENT: true }));
vi.mock("./index", () => api);
vi.mock("./core", () => api);

describe("auto global API", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(api)) mock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads preload options and exposes one callable API under new and legacy globals", async () => {
    const preloadOptions = {
      enabled: false,
      report: { mode: "summary" as const, limit: 25 },
    };
    vi.stubGlobal("window", { __REACT_SCAN_PRO_OPTIONS__: preloadOptions });

    await import("./auto");

    const globalApi = window.reactScanPro;
    expect(api.scan).toHaveBeenCalledWith(preloadOptions);
    expect(window.reactScan).toBe(globalApi);
    expect(globalApi.scan).toBe(api.scan);
    expect(globalApi.setOptions).toBe(api.setOptions);
    expect(globalApi.getOptions).toBe(api.getOptions);
    expect(globalApi.onReport).toBe(api.onReport);
    expect(globalApi.getLastReport).toBe(api.getLastReport);

    globalApi({ enabled: true });
    expect(api.scan).toHaveBeenLastCalledWith({ enabled: true });
  });
});
