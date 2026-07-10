import { type Fiber, getFiberId, getType } from "bippy";
import type { Change, Options } from "./index";
import { ChangeReason, type Render, RenderPhase, isValueUnstable } from "./instrumentation";
import {
  DEFAULT_RAW_REPORT_MAX_RECORDS,
  DEFAULT_REPORT_LIMIT,
  REPORT_REASON_MAX_EXAMPLES,
  REPORT_VALUE_MAX_DEPTH,
  REPORT_VALUE_MAX_ENTRIES,
  REPORT_VALUE_MAX_STRING_LENGTH,
} from "./reporting-constants";
import { type ScanScope, getScopeMatch } from "./scope";

export interface ReportValuePreview {
  type: string;
  preview: string;
  truncated: boolean;
}

export interface ReportReasonExample {
  previousValue?: ReportValuePreview;
  currentValue?: ReportValuePreview;
}

export interface RawRenderReason extends ReportReasonExample {
  kind: "props" | "state" | "context" | "parent" | "unknown";
  name?: string;
  unstable: boolean;
}

export interface SummaryRenderReason {
  kind: RawRenderReason["kind"];
  name?: string;
  count: number;
  unstableCount: number;
  examples: Array<ReportReasonExample>;
}

export interface ScanReportMetadata {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  observedRenderCount: number;
  observedUnmountCount: number;
  matchedScopeRootCount: number;
}

export interface RawRenderRecord {
  sequence: number;
  timestamp: number;
  commitIndex: number;
  fiberId: number;
  componentTypeId: string;
  componentName: string;
  phase: "mount" | "update" | "unmount";
  selfTime: number | null;
  totalTime: number | null;
  fps: number;
  didCommit: boolean;
  reasons: Array<RawRenderReason>;
}

export interface ComponentRenderSummary {
  componentTypeId: string;
  componentName: string;
  instanceCount: number;
  renderCount: number;
  mountCount: number;
  updateCount: number;
  unmountCount: number;
  totalSelfTime: number;
  averageSelfTime: number;
  maxSelfTime: number;
  totalTime: number;
  averageTotalTime: number;
  reasons: Array<SummaryRenderReason>;
}

export interface SummaryScanReport {
  mode: "summary";
  metadata: ScanReportMetadata;
  components: Array<ComponentRenderSummary>;
  totalComponentTypeCount: number;
  omittedComponentTypeCount: number;
  prompt: string;
}

export interface RawScanReport {
  mode: "raw";
  metadata: ScanReportMetadata;
  renders: Array<RawRenderRecord>;
  truncated: boolean;
  droppedRecordCount: number;
  prompt: string;
}

export type ScanSessionReport = SummaryScanReport | RawScanReport;
export type ScanReportListener = (report: ScanSessionReport) => void;

export interface SummaryReportOptions {
  mode?: "summary";
  limit?: number;
  sortBy?: "renderCount" | "averageSelfTime";
  onComplete?: (report: SummaryScanReport) => void;
}

export interface RawReportOptions {
  mode: "raw";
  maxRecords?: number;
  onComplete?: (report: RawScanReport) => void;
}

export type ScanReportOptions = SummaryReportOptions | RawReportOptions;

interface InternalReasonSummary {
  kind: RawRenderReason["kind"];
  name?: string;
  count: number;
  unstableCount: number;
  examples: Array<ReportReasonExample>;
}

interface InternalComponentSummary {
  componentTypeId: string;
  componentName: string;
  fiberIds: Set<number>;
  mountCount: number;
  updateCount: number;
  unmountCount: number;
  totalSelfTime: number;
  maxSelfTime: number;
  totalTime: number;
  reasons: Map<string, InternalReasonSummary>;
}

interface ReportSessionState {
  sessionId: string;
  startedAt: number;
  reportOptions: ScanReportOptions;
  scope?: ScanScope | Array<ScanScope>;
  componentTypeIds: WeakMap<object, string>;
  primitiveComponentTypeIds: Map<unknown, string>;
  nextComponentTypeId: number;
  commitIndex: number;
  sequence: number;
  observedRenderCount: number;
  observedUnmountCount: number;
  matchedScopeRootIds: Set<number>;
  rawRecords: Array<RawRenderRecord>;
  droppedRecordCount: number;
  componentSummaries: Map<string, InternalComponentSummary>;
}

let activeSession: ReportSessionState | null = null;
let lastReport: ScanSessionReport | null = null;
let nextSessionId = 0;
const reportListeners = new Set<ScanReportListener>();
const reportStoreListeners = new Set<ScanReportListener>();

const createValuePreview = (
  value: unknown,
  depth = 0,
  seenValues = new WeakSet<object>(),
): ReportValuePreview => {
  const valueType = value === null ? "null" : typeof value;
  if (typeof value === "string") {
    const truncated = value.length > REPORT_VALUE_MAX_STRING_LENGTH;
    return {
      type: "string",
      preview: JSON.stringify(
        truncated ? `${value.slice(0, REPORT_VALUE_MAX_STRING_LENGTH)}…` : value,
      ),
      truncated,
    };
  }
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return { type: valueType, preview: String(value), truncated: false };
  }
  if (typeof value === "function") {
    return {
      type: "function",
      preview: `[Function ${value.name || "anonymous"}]`,
      truncated: false,
    };
  }
  if (typeof Element !== "undefined" && value instanceof Element) {
    return {
      type: "element",
      preview: `<${value.tagName.toLowerCase()}${value.id ? `#${value.id}` : ""}>`,
      truncated: false,
    };
  }
  if (value instanceof Promise) {
    return { type: "promise", preview: "[Promise]", truncated: false };
  }
  try {
    const reactType = (value as { $$typeof?: unknown }).$$typeof;
    if (typeof reactType === "symbol" && String(reactType).includes("react.")) {
      const elementType = (value as { type?: unknown }).type;
      const componentType = elementType as { displayName?: string; name?: string } | undefined;
      const elementName =
        typeof elementType === "string"
          ? elementType
          : typeof elementType === "function"
            ? componentType?.displayName || componentType?.name || "Anonymous"
            : "Unknown";
      return {
        type: "react-element",
        preview: `[ReactElement ${elementName}]`,
        truncated: false,
      };
    }
  } catch {
    return { type: "object", preview: "[Unserializable]", truncated: true };
  }
  if (seenValues.has(value)) {
    return { type: "object", preview: "[Circular]", truncated: true };
  }
  seenValues.add(value);
  if (depth >= REPORT_VALUE_MAX_DEPTH) {
    return { type: "object", preview: "[…]", truncated: true };
  }

  if (Array.isArray(value)) {
    const entries = value
      .slice(0, REPORT_VALUE_MAX_ENTRIES)
      .map((entry) => createValuePreview(entry, depth + 1, seenValues).preview);
    const truncated = value.length > REPORT_VALUE_MAX_ENTRIES;
    return {
      type: "array",
      preview: `[${entries.join(", ")}${truncated ? ", …" : ""}]`,
      truncated,
    };
  }

  try {
    const keys = Object.keys(value);
    const preview = keys
      .slice(0, REPORT_VALUE_MAX_ENTRIES)
      .map(
        (key) =>
          `${key}: ${createValuePreview((value as Record<string, unknown>)[key], depth + 1, seenValues).preview}`,
      )
      .join(", ");
    const truncated = keys.length > REPORT_VALUE_MAX_ENTRIES;
    return {
      type: value.constructor?.name || "object",
      preview: `{${preview}${truncated ? ", …" : ""}}`,
      truncated,
    };
  } catch {
    return { type: "object", preview: "[Unserializable]", truncated: true };
  }
};

type ReasonIdentity = Pick<RawRenderReason, "kind" | "name" | "unstable">;

const getReasonIdentity = (change: Change): ReasonIdentity => {
  const kind =
    change.type === ChangeReason.Props
      ? "props"
      : change.type === ChangeReason.Context
        ? "context"
        : "state";
  return {
    kind,
    name: change.name,
    unstable: isValueUnstable(change.prevValue, change.value),
  };
};

const createReason = (change: Change): RawRenderReason => {
  return {
    ...getReasonIdentity(change),
    previousValue: createValuePreview(change.prevValue),
    currentValue: createValuePreview(change.value),
  };
};

const createRenderReasons = (render: Render): Array<RawRenderReason> => {
  const reasons = render.changes.map(createReason);
  if (render.parentRendered) {
    reasons.push({ kind: "parent", unstable: false });
  }
  if (render.phase === RenderPhase.Update && reasons.length === 0) {
    reasons.push({ kind: "unknown", unstable: false });
  }
  return reasons;
};

const snapshotScope = (
  scope: ScanScope | Array<ScanScope> | undefined,
): ScanScope | Array<ScanScope> | undefined => {
  if (!scope) return undefined;
  return Array.isArray(scope) ? scope.map((item) => ({ ...item })) : { ...scope };
};

const snapshotReportOptions = (report: ScanReportOptions | undefined): ScanReportOptions => {
  if (report?.mode === "raw") {
    const configuredMax = report.maxRecords;
    const maxRecords =
      configuredMax === Infinity
        ? Infinity
        : typeof configuredMax === "number" && Number.isFinite(configuredMax) && configuredMax >= 0
          ? Math.floor(configuredMax)
          : DEFAULT_RAW_REPORT_MAX_RECORDS;
    return { ...report, maxRecords };
  }

  const configuredLimit = report?.limit;
  const limit =
    typeof configuredLimit === "number" && Number.isFinite(configuredLimit) && configuredLimit >= 0
      ? Math.floor(configuredLimit)
      : DEFAULT_REPORT_LIMIT;
  return {
    ...report,
    mode: "summary",
    limit,
    sortBy: report?.sortBy === "averageSelfTime" ? "averageSelfTime" : "renderCount",
  };
};

const getComponentTypeId = (session: ReportSessionState, fiber: Fiber): string => {
  const componentType = getType(fiber.type);
  if (
    (typeof componentType === "object" && componentType !== null) ||
    typeof componentType === "function"
  ) {
    const objectType = componentType as object;
    const existingId = session.componentTypeIds.get(objectType);
    if (existingId) return existingId;
    const nextId = `component-${++session.nextComponentTypeId}`;
    session.componentTypeIds.set(objectType, nextId);
    return nextId;
  }

  const existingId = session.primitiveComponentTypeIds.get(componentType);
  if (existingId) return existingId;
  const nextId = `component-${++session.nextComponentTypeId}`;
  session.primitiveComponentTypeIds.set(componentType, nextId);
  return nextId;
};

const getPhaseName = (phase: RenderPhase): RawRenderRecord["phase"] => {
  if (phase === RenderPhase.Mount) return "mount";
  if (phase === RenderPhase.Unmount) return "unmount";
  return "update";
};

const createSession = (options: Options): ReportSessionState => ({
  sessionId: `scan-${Date.now()}-${++nextSessionId}`,
  startedAt: Date.now(),
  reportOptions: snapshotReportOptions(options.report),
  scope: snapshotScope(options.scope),
  componentTypeIds: new WeakMap<object, string>(),
  primitiveComponentTypeIds: new Map<unknown, string>(),
  nextComponentTypeId: 0,
  commitIndex: 0,
  sequence: 0,
  observedRenderCount: 0,
  observedUnmountCount: 0,
  matchedScopeRootIds: new Set<number>(),
  rawRecords: [],
  droppedRecordCount: 0,
  componentSummaries: new Map<string, InternalComponentSummary>(),
});

const createMetadata = (session: ReportSessionState, endedAt: number): ScanReportMetadata => ({
  sessionId: session.sessionId,
  startedAt: session.startedAt,
  endedAt,
  durationMs: endedAt - session.startedAt,
  observedRenderCount: session.observedRenderCount,
  observedUnmountCount: session.observedUnmountCount,
  matchedScopeRootCount: session.matchedScopeRootIds.size,
});

const toComponentSummary = (summary: InternalComponentSummary): ComponentRenderSummary => {
  const renderCount = summary.mountCount + summary.updateCount;
  return {
    componentTypeId: summary.componentTypeId,
    componentName: summary.componentName,
    instanceCount: summary.fiberIds.size,
    renderCount,
    mountCount: summary.mountCount,
    updateCount: summary.updateCount,
    unmountCount: summary.unmountCount,
    totalSelfTime: summary.totalSelfTime,
    averageSelfTime: renderCount > 0 ? summary.totalSelfTime / renderCount : 0,
    maxSelfTime: summary.maxSelfTime,
    totalTime: summary.totalTime,
    averageTotalTime: renderCount > 0 ? summary.totalTime / renderCount : 0,
    reasons: Array.from(summary.reasons.values()),
  };
};

const recordSummaryReason = (
  summary: InternalComponentSummary,
  reason: ReasonIdentity,
  change?: Change,
) => {
  const reasonKey = `${reason.kind}:${reason.name ?? ""}`;
  let reasonSummary = summary.reasons.get(reasonKey);
  if (!reasonSummary) {
    reasonSummary = {
      kind: reason.kind,
      name: reason.name,
      count: 0,
      unstableCount: 0,
      examples: [],
    };
    summary.reasons.set(reasonKey, reasonSummary);
  }
  reasonSummary.count++;
  if (reason.unstable) reasonSummary.unstableCount++;
  if (change && reasonSummary.examples.length < REPORT_REASON_MAX_EXAMPLES) {
    reasonSummary.examples.push({
      previousValue: createValuePreview(change.prevValue),
      currentValue: createValuePreview(change.value),
    });
  }
};

const recordSummaryReasons = (summary: InternalComponentSummary, render: Render) => {
  for (const change of render.changes) {
    recordSummaryReason(summary, getReasonIdentity(change), change);
  }
  if (render.parentRendered) {
    recordSummaryReason(summary, { kind: "parent", unstable: false });
  }
  if (
    render.phase === RenderPhase.Update &&
    render.changes.length === 0 &&
    !render.parentRendered
  ) {
    recordSummaryReason(summary, { kind: "unknown", unstable: false });
  }
};

const createSummaryReport = (session: ReportSessionState, endedAt: number): SummaryScanReport => {
  const reportOptions = session.reportOptions as SummaryReportOptions;
  const limit = reportOptions.limit ?? DEFAULT_REPORT_LIMIT;
  const sortBy = reportOptions.sortBy ?? "renderCount";
  const allComponents = Array.from(session.componentSummaries.values()).map(toComponentSummary);
  allComponents.sort((left, right) => {
    const primaryDifference =
      sortBy === "averageSelfTime"
        ? right.averageSelfTime - left.averageSelfTime
        : right.renderCount - left.renderCount;
    if (primaryDifference !== 0) return primaryDifference;
    const secondaryDifference =
      sortBy === "averageSelfTime"
        ? right.renderCount - left.renderCount
        : right.averageSelfTime - left.averageSelfTime;
    if (secondaryDifference !== 0) return secondaryDifference;
    const nameDifference = left.componentName.localeCompare(right.componentName);
    if (nameDifference !== 0) return nameDifference;
    return left.componentTypeId.localeCompare(right.componentTypeId);
  });
  const components = allComponents.slice(0, limit);
  return {
    mode: "summary",
    metadata: createMetadata(session, endedAt),
    components,
    totalComponentTypeCount: allComponents.length,
    omittedComponentTypeCount: Math.max(0, allComponents.length - components.length),
    prompt:
      "Analyze the adjacent React Scan Pro component summaries. Prioritize high renderCount and averageSelfTime values, explain repeated props/state/context/parent reasons, and recommend concrete React optimizations.",
  };
};

const createRawReport = (session: ReportSessionState, endedAt: number): RawScanReport => ({
  mode: "raw",
  metadata: createMetadata(session, endedAt),
  renders: session.rawRecords,
  truncated: session.droppedRecordCount > 0,
  droppedRecordCount: session.droppedRecordCount,
  prompt:
    "Analyze the adjacent chronological React Scan Pro raw render records without assuming they were aggregated. Correlate commits, component instances, timings, phases, and render reasons to identify performance bottlenecks.",
});

const notifyReport = (report: ScanSessionReport, reportOptions: ScanReportOptions) => {
  lastReport = report;
  try {
    if (report.mode === "raw" && reportOptions.mode === "raw") {
      reportOptions.onComplete?.(report);
    } else if (report.mode === "summary" && reportOptions.mode !== "raw") {
      reportOptions.onComplete?.(report);
    }
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.error("[React Scan Pro] The report callback threw.", error);
  }

  for (const listener of Array.from(reportListeners)) {
    try {
      listener(report);
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.error("[React Scan Pro] A report listener threw.", error);
    }
  }

  for (const listener of Array.from(reportStoreListeners)) {
    try {
      listener(report);
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.error("[React Scan Pro] An internal report listener threw.", error);
    }
  }
};

const releaseSessionMemory = (session: ReportSessionState, report: ScanSessionReport) => {
  session.matchedScopeRootIds.clear();
  session.primitiveComponentTypeIds.clear();
  session.componentSummaries.clear();
  session.scope = undefined;

  // Raw reports intentionally retain their record array as the published result.
  // Detach it from the discarded session object so no second owner remains.
  if (report.mode === "raw") session.rawRecords = [];
  else session.rawRecords.length = 0;
};

const finishSession = () => {
  const session = activeSession;
  if (!session) return;
  activeSession = null;
  const endedAt = Date.now();
  const report =
    session.reportOptions.mode === "raw"
      ? createRawReport(session, endedAt)
      : createSummaryReport(session, endedAt);
  notifyReport(report, session.reportOptions);
  releaseSessionMemory(session, report);
};

export const syncReportSession = (previousOptions: Options, nextOptions: Options) => {
  const wasEnabled = previousOptions.enabled !== false;
  const isEnabled = nextOptions.enabled !== false;
  if (activeSession && wasEnabled && !isEnabled) {
    finishSession();
    return;
  }
  if (!activeSession && isEnabled && (nextOptions.report || reportListeners.size > 0)) {
    activeSession = createSession(nextOptions);
  }
};

export const ensureReportSession = (options: Options) => {
  if (!activeSession && options.enabled !== false && (options.report || reportListeners.size > 0)) {
    activeSession = createSession(options);
  }
};

export const isReportSessionActive = () => activeSession !== null;

export const getReportSessionScope = () => activeSession?.scope;

export const beginReportCommit = () => {
  if (activeSession) activeSession.commitIndex++;
};

export const recordReportRender = (fiber: Fiber, renders: Array<Render>) => {
  const session = activeSession;
  if (!session) return;

  const scopeMatch = getScopeMatch(fiber, session.scope);
  if (!scopeMatch.isMatch) return;
  if (scopeMatch.rootFiberId !== null) {
    session.matchedScopeRootIds.add(scopeMatch.rootFiberId);
  }

  let componentTypeId: string | undefined;
  let fiberId: number | undefined;
  const getRecordIdentity = () => {
    componentTypeId ??= getComponentTypeId(session, fiber);
    fiberId ??= getFiberId(fiber);
    return { componentTypeId, fiberId };
  };

  for (const render of renders) {
    const phase = getPhaseName(render.phase);
    if (phase === "unmount") session.observedUnmountCount++;
    else session.observedRenderCount++;

    if (session.reportOptions.mode === "raw") {
      const maxRecords = session.reportOptions.maxRecords ?? DEFAULT_RAW_REPORT_MAX_RECORDS;
      if (session.rawRecords.length < maxRecords) {
        const identity = getRecordIdentity();
        session.rawRecords.push({
          sequence: ++session.sequence,
          timestamp: Date.now(),
          commitIndex: session.commitIndex,
          ...identity,
          componentName: render.componentName ?? "Anonymous",
          phase,
          selfTime: render.selfTime,
          totalTime: render.totalTime,
          fps: render.fps,
          didCommit: render.didCommit,
          reasons: createRenderReasons(render),
        });
      } else {
        session.droppedRecordCount++;
      }
      continue;
    }

    const identity = getRecordIdentity();
    const componentName = render.componentName ?? "Anonymous";

    let summary = session.componentSummaries.get(identity.componentTypeId);
    if (!summary) {
      summary = {
        componentTypeId: identity.componentTypeId,
        componentName,
        fiberIds: new Set<number>(),
        mountCount: 0,
        updateCount: 0,
        unmountCount: 0,
        totalSelfTime: 0,
        maxSelfTime: 0,
        totalTime: 0,
        reasons: new Map<string, InternalReasonSummary>(),
      };
      session.componentSummaries.set(identity.componentTypeId, summary);
    }
    summary.fiberIds.add(identity.fiberId);
    if (phase === "mount") summary.mountCount++;
    else if (phase === "update") summary.updateCount++;
    else summary.unmountCount++;
    if (phase !== "unmount") {
      const selfTime = render.selfTime ?? 0;
      summary.totalSelfTime += selfTime;
      summary.maxSelfTime = Math.max(summary.maxSelfTime, selfTime);
      summary.totalTime += render.totalTime ?? 0;
    }
    recordSummaryReasons(summary, render);
  }
};

export const subscribeToReports = (listener: ScanReportListener) => {
  reportListeners.add(listener);
  return () => {
    reportListeners.delete(listener);
  };
};

// Passive subscriptions are used by the toolbar UI. Unlike public onReport
// listeners, they do not implicitly start an otherwise unconfigured session.
export const subscribeToReportStore = (listener: ScanReportListener) => {
  reportStoreListeners.add(listener);
  return () => {
    reportStoreListeners.delete(listener);
  };
};

export const getLastReport = () => lastReport;

export const resetReportingForTests = () => {
  activeSession = null;
  lastReport = null;
  nextSessionId = 0;
  reportListeners.clear();
  reportStoreListeners.clear();
};
