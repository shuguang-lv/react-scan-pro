import { type Fiber, FunctionComponentTag } from "bippy";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Options, PropsChange } from "./index";
import { ChangeReason, type Render, RenderPhase } from "./instrumentation";
import {
  beginReportCommit,
  clearLastReport,
  ensureReportSession,
  getLastReport,
  isReportSessionActive,
  recordReportRender,
  resetReportingForTests,
  subscribeToReportStore,
  subscribeToReports,
  syncReportSession,
} from "./reporting";

const Component = () => null;

const createFiber = (type: unknown = Component, parent: Fiber | null = null): Fiber =>
  ({
    type,
    tag: FunctionComponentTag,
    memoizedProps: {},
    return: parent,
    alternate: null,
  }) as Fiber;

const createRender = (
  selfTime: number,
  changes: Array<PropsChange> = [],
  phase = RenderPhase.Update,
  componentName: string | null = "Component",
): Render => ({
  phase,
  componentName,
  time: selfTime,
  selfTime,
  totalTime: selfTime * 2,
  count: 1,
  forget: false,
  changes,
  parentRendered: false,
  unnecessary: null,
  didCommit: true,
  fps: 60,
});

describe("reporting", () => {
  afterEach(() => {
    resetReportingForTests();
  });

  it("aggregates summary renders and invokes the completion callback", () => {
    const onComplete = vi.fn();
    const disabledOptions: Options = { enabled: false };
    const enabledOptions: Options = {
      enabled: true,
      report: { mode: "summary", onComplete },
    };
    const propChange: PropsChange = {
      type: ChangeReason.Props,
      name: "value",
      prevValue: "before",
      value: "after",
    };

    syncReportSession(disabledOptions, enabledOptions);
    beginReportCommit();
    const fiber = createFiber();
    recordReportRender(fiber, [createRender(2, [propChange]), createRender(4, [propChange])]);
    syncReportSession(enabledOptions, disabledOptions);

    expect(onComplete).toHaveBeenCalledOnce();
    const report = onComplete.mock.calls[0]?.[0];
    expect(report.mode).toBe("summary");
    expect(report.components[0]).toMatchObject({
      componentName: "Component",
      renderCount: 2,
      instanceCount: 1,
      averageSelfTime: 3,
      averageTotalTime: 6,
    });
    expect(report.components[0].reasons[0]).toMatchObject({
      kind: "props",
      name: "value",
      count: 2,
    });
    expect(report.prompt).toContain("React Scan Pro");
  });

  it("resolves wrapper, debug, and owner names before falling back to Anonymous", () => {
    const onComplete = vi.fn();
    const enabledOptions: Options = {
      enabled: true,
      report: { mode: "raw", onComplete },
    };
    const OwnerComponent = () => null;
    const anonymousComponent = () => null;
    Object.defineProperty(anonymousComponent, "name", { value: "" });
    const ownerFiber = createFiber(OwnerComponent);
    const ownerFallbackFiber = createFiber(anonymousComponent, ownerFiber);
    const wrapperFiber = createFiber({ displayName: "SearchInput", render: anonymousComponent });
    const debugFiber = createFiber(anonymousComponent);
    debugFiber._debugInfo = [{ name: "ServerResult" }];

    syncReportSession({ enabled: false }, enabledOptions);
    recordReportRender(wrapperFiber, [createRender(1, [], RenderPhase.Mount, null)]);
    recordReportRender(debugFiber, [createRender(1, [], RenderPhase.Mount, null)]);
    recordReportRender(ownerFallbackFiber, [createRender(1, [], RenderPhase.Mount, null)]);
    syncReportSession(enabledOptions, { enabled: false });

    const report = onComplete.mock.calls[0]?.[0];
    expect(report.renders.map((render: { componentName: string }) => render.componentName)).toEqual(
      ["SearchInput", "ServerResult", "Anonymous (OwnerComponent)"],
    );
  });

  it("caps raw records and exposes the report through global listeners", () => {
    const listener = vi.fn();
    subscribeToReports(listener);
    const enabledOptions: Options = {
      enabled: true,
      report: { mode: "raw", maxRecords: 1 },
    };
    ensureReportSession(enabledOptions);
    beginReportCommit();
    recordReportRender(createFiber(), [createRender(1), createRender(2)]);
    syncReportSession(enabledOptions, { enabled: false });

    expect(listener).toHaveBeenCalledOnce();
    expect(getLastReport()).toMatchObject({
      mode: "raw",
      truncated: true,
      droppedRecordCount: 1,
    });
    const report = getLastReport();
    expect(report?.mode === "raw" ? report.renders : []).toHaveLength(1);
  });

  it("uses summary mode for listeners without report options and supports unsubscribe", () => {
    const activeListener = vi.fn();
    const removedListener = vi.fn();
    subscribeToReports(activeListener);
    const unsubscribe = subscribeToReports(removedListener);
    unsubscribe();

    const enabled: Options = { enabled: true };
    ensureReportSession(enabled);
    recordReportRender(createFiber(), [createRender(1)]);
    syncReportSession(enabled, { enabled: false });

    expect(activeListener).toHaveBeenCalledOnce();
    expect(activeListener.mock.calls[0]?.[0].mode).toBe("summary");
    expect(removedListener).not.toHaveBeenCalled();
  });

  it("keeps toolbar subscriptions passive and preserves the published result after cleanup", () => {
    const toolbarListener = vi.fn();
    subscribeToReportStore(toolbarListener);
    ensureReportSession({ enabled: true });
    expect(isReportSessionActive()).toBe(false);

    const enabled: Options = { enabled: true, report: { mode: "raw", maxRecords: 5 } };
    ensureReportSession(enabled);
    recordReportRender(createFiber(), [createRender(1), createRender(2)]);
    syncReportSession(enabled, { enabled: false });

    expect(toolbarListener).toHaveBeenCalledOnce();
    const report = getLastReport();
    expect(report?.mode === "raw" ? report.renders : []).toHaveLength(2);
    expect(isReportSessionActive()).toBe(false);
  });

  it("clears the stored report without notifying public report listeners", () => {
    const publicListener = vi.fn();
    const toolbarListener = vi.fn();
    subscribeToReports(publicListener);
    subscribeToReportStore(toolbarListener);
    const enabled: Options = { enabled: true, report: { mode: "summary" } };
    ensureReportSession(enabled);
    recordReportRender(createFiber(), [createRender(1)]);
    syncReportSession(enabled, { enabled: false });

    clearLastReport();

    expect(getLastReport()).toBeNull();
    expect(publicListener).toHaveBeenCalledOnce();
    expect(toolbarListener).toHaveBeenLastCalledWith(null);
  });

  it("creates independent empty sessions and isolates callback failures", () => {
    const events: Array<string> = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onComplete = vi.fn(() => {
      events.push("onComplete");
      throw new Error("callback failure");
    });
    subscribeToReports((report) => {
      expect(getLastReport()).toBe(report);
      events.push("listener-one");
      throw new Error("listener failure");
    });
    subscribeToReports(() => events.push("listener-two"));

    const disabled: Options = { enabled: false };
    const enabled: Options = { enabled: true, report: { onComplete } };
    syncReportSession(disabled, enabled);
    syncReportSession(enabled, disabled);
    const firstReport = getLastReport();
    syncReportSession(disabled, enabled);
    syncReportSession(enabled, disabled);

    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(events).toEqual([
      "onComplete",
      "listener-one",
      "listener-two",
      "onComplete",
      "listener-one",
      "listener-two",
    ]);
    expect(firstReport).not.toBe(getLastReport());
    expect(firstReport?.metadata.sessionId).not.toBe(getLastReport()?.metadata.sessionId);
    expect(firstReport?.mode === "summary" ? firstReport.components : null).toEqual([]);
    expect(consoleError).toHaveBeenCalledTimes(4);
    consoleError.mockRestore();
  });

  it("snapshots report and scope options until the next session", () => {
    const First = () => null;
    const Second = () => null;
    const scope = { kind: "component-name", name: "First" } as const;
    const onComplete = vi.fn();
    const reportOptions = { mode: "summary", limit: 1, onComplete } as const;
    const enabled: Options = { enabled: true, scope, report: reportOptions };

    syncReportSession({ enabled: false }, enabled);
    (scope as { name: string }).name = "Second";
    (reportOptions as { limit: number }).limit = 0;
    recordReportRender(createFiber(First), [createRender(1, [], RenderPhase.Mount, "First")]);
    recordReportRender(createFiber(Second), [createRender(10, [], RenderPhase.Mount, "Second")]);
    syncReportSession(enabled, { enabled: false });

    const report = onComplete.mock.calls[0]?.[0];
    expect(report.components).toHaveLength(1);
    expect(report.components[0].componentName).toBe("First");
  });

  it("sorts summaries deterministically and merges component instances", () => {
    const FastFrequent = () => null;
    const SlowRare = () => null;
    const onComplete = vi.fn();
    const enabled: Options = {
      enabled: true,
      report: { mode: "summary", limit: 1, sortBy: "averageSelfTime", onComplete },
    };
    syncReportSession({ enabled: false }, enabled);
    recordReportRender(createFiber(FastFrequent), [
      createRender(1, [], RenderPhase.Mount, "FastFrequent"),
      createRender(1, [], RenderPhase.Update, "FastFrequent"),
    ]);
    recordReportRender(createFiber(FastFrequent), [
      createRender(1, [], RenderPhase.Update, "FastFrequent"),
    ]);
    recordReportRender(createFiber(SlowRare), [createRender(8, [], RenderPhase.Mount, "SlowRare")]);
    syncReportSession(enabled, { enabled: false });

    const report = onComplete.mock.calls[0]?.[0];
    expect(report.components).toHaveLength(1);
    expect(report.components[0].componentName).toBe("SlowRare");
    expect(report.totalComponentTypeCount).toBe(2);
    expect(report.omittedComponentTypeCount).toBe(1);

    resetReportingForTests();
    const merged = vi.fn();
    const mergeOptions: Options = { enabled: true, report: { onComplete: merged } };
    syncReportSession({ enabled: false }, mergeOptions);
    recordReportRender(createFiber(FastFrequent), [createRender(1)]);
    recordReportRender(createFiber(FastFrequent), [createRender(1)]);
    syncReportSession(mergeOptions, { enabled: false });
    expect(merged.mock.calls[0]?.[0].components[0]).toMatchObject({
      renderCount: 2,
      instanceCount: 2,
    });
  });

  it("returns JSON-safe bounded reason previews and deterministic prompts", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    const reactElement = {
      $$typeof: Symbol.for("react.transitional.element"),
      type: "button",
      props: {},
    };
    const changes: Array<PropsChange> = [
      {
        type: ChangeReason.Props,
        name: "longText",
        prevValue: "short",
        value: "x".repeat(250),
      },
      { type: ChangeReason.Props, name: "callback", prevValue: null, value: function handler() {} },
      { type: ChangeReason.Props, name: "element", prevValue: null, value: reactElement },
      { type: ChangeReason.Props, name: "circular", prevValue: null, value: circular },
    ];
    const onComplete = vi.fn();
    const enabled: Options = { enabled: true, report: { onComplete } };
    syncReportSession({ enabled: false }, enabled);
    recordReportRender(createFiber(), [createRender(1, changes)]);
    syncReportSession(enabled, { enabled: false });

    const report = onComplete.mock.calls[0]?.[0];
    expect(() => JSON.stringify(report)).not.toThrow();
    expect(report.prompt).toBe(
      "Analyze the adjacent React Scan Pro component summaries. Prioritize high renderCount and averageSelfTime values, explain repeated props/state/context/parent reasons, and recommend concrete React optimizations.",
    );
    expect(report.components[0].reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "longText" }),
        expect.objectContaining({ name: "callback" }),
        expect.objectContaining({ name: "element" }),
        expect.objectContaining({ name: "circular" }),
      ]),
    );
    const elementReason = report.components[0].reasons.find(
      (reason: { name?: string }) => reason.name === "element",
    );
    expect(elementReason?.examples[0]?.currentValue).toMatchObject({
      type: "react-element",
      preview: "[ReactElement button]",
    });
  });
});
