import { type Fiber, getFiberId, getType } from "bippy";
import { REACT_SCAN_PRO_LOG_PREFIX } from "../logging-constants";
import type { Change, Options } from "./index";
import { ChangeReason, type Render, RenderPhase, isValueUnstable } from "./instrumentation";
import {
  DEFAULT_RAW_REPORT_MAX_RECORDS,
  DEFAULT_REPORT_LIMIT,
  DEFAULT_REPORT_TREE_MAX_NODES,
  REPORT_REASON_MAX_EXAMPLES,
  REPORT_HIGHLIGHT_MAX_ELEMENTS,
  REPORT_HIGHLIGHT_MAX_ELEMENTS_PER_ITEM,
  REPORT_VALUE_MAX_DEPTH,
  REPORT_VALUE_MAX_ENTRIES,
  REPORT_VALUE_MAX_STRING_LENGTH,
} from "./reporting-constants";
import { type ScanScope, getScopeMatch } from "./scope";
import { getComponentName } from "./utils/get-component-name";
import { getNearestHostElements } from "./utils/get-nearest-host-elements";
import { getRenderCount } from "./utils/get-render-count";

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
  parentFiberId: number | null;
  componentTypeId: string;
  componentName: string;
  phase: "mount" | "update" | "unmount";
  renderCount: number;
  selfTime: number | null;
  totalTime: number | null;
  fps: number;
  didCommit: boolean;
  reasons: Array<RawRenderReason>;
}

export interface ComponentTreeNode {
  fiberId: number;
  parentFiberId: number | null;
  componentTypeId: string;
  componentName: string;
  didRender: boolean;
  renderCount: number;
  subtreeRenderCount: number;
  mountCount: number;
  updateCount: number;
  unmountCount: number;
  totalSelfTime: number;
  maxSelfTime: number;
  totalTime: number;
  children: Array<ComponentTreeNode>;
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
  schemaVersion: 1;
  metadata: ScanReportMetadata;
  components: Array<ComponentRenderSummary>;
  componentTree: Array<ComponentTreeNode>;
  totalComponentTypeCount: number;
  omittedComponentTypeCount: number;
  totalTreeNodeCount: number;
  omittedTreeNodeCount: number;
  prompt: string;
}

export interface RawScanReport {
  mode: "raw";
  schemaVersion: 1;
  metadata: ScanReportMetadata;
  renders: Array<RawRenderRecord>;
  componentTree: Array<ComponentTreeNode>;
  totalTreeNodeCount: number;
  omittedTreeNodeCount: number;
  truncated: boolean;
  droppedRecordCount: number;
  prompt: string;
}

export type ScanSessionReport = SummaryScanReport | RawScanReport;
export type ScanReportListener = (report: ScanSessionReport) => void;
export type ScanReportStoreListener = (report: ScanSessionReport | null) => void;

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

interface InternalComponentTreeNode {
  fiberId: number;
  parentFiberId: number | null;
  componentTypeId: string;
  componentName: string;
  didRender: boolean;
  mountCount: number;
  updateCount: number;
  unmountCount: number;
  totalSelfTime: number;
  maxSelfTime: number;
  totalTime: number;
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
  componentTreeNodes: Map<number, InternalComponentTreeNode>;
  omittedTreeFibers: WeakSet<object>;
  omittedTreeNodeCount: number;
  componentElements: Map<string, Map<number, Array<Element>>>;
  rawRecordElements: Map<number, Array<Element>>;
  highlightElementCount: number;
}

interface ReportElementStore {
  sessionId: string;
  componentElements: Map<string, Array<Element>>;
  rawRecordElements: Map<number, Array<Element>>;
}

let activeSession: ReportSessionState | null = null;
let lastReport: ScanSessionReport | null = null;
let lastReportElements: ReportElementStore | null = null;
let nextSessionId = 0;
const reportListeners = new Set<ScanReportListener>();
const reportStoreListeners = new Set<ScanReportStoreListener>();

const notifyReportStoreListeners = (report: ScanSessionReport | null) => {
  for (const listener of Array.from(reportStoreListeners)) {
    try {
      listener(report);
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.error(REACT_SCAN_PRO_LOG_PREFIX, "An internal report listener threw.", error);
    }
  }
};

export const createReportValuePreview = (
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
  if (depth >= REPORT_VALUE_MAX_DEPTH) {
    return { type: "object", preview: "[…]", truncated: true };
  }
  if (seenValues.has(value)) {
    return { type: "object", preview: "[Circular]", truncated: true };
  }
  seenValues.add(value);

  try {
    if (Array.isArray(value)) {
      const entries = value
        .slice(0, REPORT_VALUE_MAX_ENTRIES)
        .map((entry) => createReportValuePreview(entry, depth + 1, seenValues).preview);
      const truncated = value.length > REPORT_VALUE_MAX_ENTRIES;
      return {
        type: "array",
        preview: `[${entries.join(", ")}${truncated ? ", …" : ""}]`,
        truncated,
      };
    }

    const keys = Object.keys(value);
    const preview = keys
      .slice(0, REPORT_VALUE_MAX_ENTRIES)
      .map(
        (key) =>
          `${key}: ${createReportValuePreview((value as Record<string, unknown>)[key], depth + 1, seenValues).preview}`,
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
  } finally {
    seenValues.delete(value);
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
    previousValue: createReportValuePreview(change.prevValue),
    currentValue: createReportValuePreview(change.value),
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
  componentTreeNodes: new Map<number, InternalComponentTreeNode>(),
  omittedTreeFibers: new WeakSet<object>(),
  omittedTreeNodeCount: 0,
  componentElements: new Map<string, Map<number, Array<Element>>>(),
  rawRecordElements: new Map<number, Array<Element>>(),
  highlightElementCount: 0,
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

const getParentComponentFiber = (fiber: Fiber): Fiber | null => {
  let parentFiber = fiber.return;
  while (parentFiber) {
    const componentType = getType(parentFiber.type);
    if (
      componentType !== null &&
      componentType !== undefined &&
      typeof componentType !== "string"
    ) {
      return parentFiber;
    }
    parentFiber = parentFiber.return;
  }
  return null;
};

const ensureComponentTreeNode = (
  session: ReportSessionState,
  fiber: Fiber,
): InternalComponentTreeNode | null => {
  const fiberId = getFiberId(fiber);
  const existingNode = session.componentTreeNodes.get(fiberId);
  if (existingNode) return existingNode;

  const parentFiber = getParentComponentFiber(fiber);
  const parentNode = parentFiber ? ensureComponentTreeNode(session, parentFiber) : null;
  if (session.componentTreeNodes.size >= DEFAULT_REPORT_TREE_MAX_NODES) {
    if (!session.omittedTreeFibers.has(fiber)) {
      session.omittedTreeFibers.add(fiber);
      session.omittedTreeNodeCount++;
    }
    return null;
  }

  const node: InternalComponentTreeNode = {
    fiberId,
    parentFiberId: parentNode?.fiberId ?? null,
    componentTypeId: getComponentTypeId(session, fiber),
    componentName: getComponentName(fiber),
    didRender: false,
    mountCount: 0,
    updateCount: 0,
    unmountCount: 0,
    totalSelfTime: 0,
    maxSelfTime: 0,
    totalTime: 0,
  };
  session.componentTreeNodes.set(fiberId, node);
  return node;
};

const createComponentTree = (session: ReportSessionState): Array<ComponentTreeNode> => {
  const publicNodes = new Map<number, ComponentTreeNode>();
  for (const node of session.componentTreeNodes.values()) {
    publicNodes.set(node.fiberId, {
      ...node,
      renderCount: node.mountCount + node.updateCount,
      subtreeRenderCount: node.mountCount + node.updateCount,
      children: [],
    });
  }

  const roots: Array<ComponentTreeNode> = [];
  for (const node of publicNodes.values()) {
    const parentNode =
      node.parentFiberId === null ? undefined : publicNodes.get(node.parentFiberId);
    if (parentNode) parentNode.children.push(node);
    else roots.push(node);
  }

  const aggregateAndSortNodes = (nodes: Array<ComponentTreeNode>) => {
    for (const node of nodes) {
      aggregateAndSortNodes(node.children);
      const descendantRenderCount = node.children.reduce(
        (totalRenderCount, childNode) => totalRenderCount + childNode.subtreeRenderCount,
        0,
      );
      const descendantTime = node.children.reduce(
        (totalTime, childNode) => totalTime + childNode.totalTime,
        0,
      );
      node.subtreeRenderCount += descendantRenderCount;
      node.totalTime = Math.max(node.totalTime, descendantTime);
    }
    nodes.sort(
      (left, right) =>
        right.totalTime - left.totalTime ||
        right.renderCount - left.renderCount ||
        left.componentName.localeCompare(right.componentName),
    );
  };
  aggregateAndSortNodes(roots);
  return roots;
};

const recordSummaryReason = (
  summary: InternalComponentSummary,
  reason: ReasonIdentity,
  renderCount: number,
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
  reasonSummary.count += renderCount;
  if (reason.unstable) reasonSummary.unstableCount += renderCount;
  if (change && reasonSummary.examples.length < REPORT_REASON_MAX_EXAMPLES) {
    reasonSummary.examples.push({
      previousValue: createReportValuePreview(change.prevValue),
      currentValue: createReportValuePreview(change.value),
    });
  }
};

const recordSummaryReasons = (
  summary: InternalComponentSummary,
  render: Render,
  renderCount: number,
) => {
  for (const change of render.changes) {
    recordSummaryReason(summary, getReasonIdentity(change), renderCount, change);
  }
  if (render.parentRendered) {
    recordSummaryReason(summary, { kind: "parent", unstable: false }, renderCount);
  }
  if (
    render.phase === RenderPhase.Update &&
    render.changes.length === 0 &&
    !render.parentRendered
  ) {
    recordSummaryReason(summary, { kind: "unknown", unstable: false }, renderCount);
  }
};

const recordTreeNodeRender = (
  node: InternalComponentTreeNode,
  render: Render,
  renderCount: number,
) => {
  const phase = getPhaseName(render.phase);
  node.didRender = true;
  if (phase === "mount") node.mountCount += renderCount;
  else if (phase === "update") node.updateCount += renderCount;
  else node.unmountCount += renderCount;
  if (phase === "unmount") return;

  const selfTime = render.selfTime ?? 0;
  node.totalSelfTime += selfTime;
  node.maxSelfTime = Math.max(node.maxSelfTime, selfTime);
  node.totalTime += render.totalTime ?? 0;
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
  const componentTree = createComponentTree(session);
  return {
    mode: "summary",
    schemaVersion: 1,
    prompt:
      "Analyze this React Scan Pro performance capture. All timing fields are milliseconds. components contains type-level aggregates across instances; componentTree contains instance-level hierarchy. In tree nodes, renderCount and totalSelfTime are own-instance metrics, while subtreeRenderCount and totalTime describe branch activity. Nodes with didRender=false are structural ancestors, so their own metrics are zero. Prioritize high renderCount, totalSelfTime, averageSelfTime, and unstable prop/state/context reasons. Distinguish expensive self work from expensive descendants, account for omitted counts, and recommend specific React changes with evidence from component names, timings, and reasons.",
    metadata: createMetadata(session, endedAt),
    components,
    componentTree,
    totalComponentTypeCount: allComponents.length,
    omittedComponentTypeCount: Math.max(0, allComponents.length - components.length),
    totalTreeNodeCount: session.componentTreeNodes.size + session.omittedTreeNodeCount,
    omittedTreeNodeCount: session.omittedTreeNodeCount,
  };
};

const createRawReport = (session: ReportSessionState, endedAt: number): RawScanReport => {
  const componentTree = createComponentTree(session);
  return {
    mode: "raw",
    schemaVersion: 1,
    prompt:
      "Analyze this chronological React Scan Pro performance capture. All timing fields are milliseconds. Each render record can represent renderCount renders. Correlate commitIndex, fiberId, parentFiberId, componentTree, timings, phases, FPS, and render reasons. In tree nodes, renderCount and totalSelfTime are own-instance metrics, while subtreeRenderCount and totalTime describe branch activity. Nodes with didRender=false are structural ancestors, so their own metrics are zero. Identify render cascades, unstable inputs, repeated work, and expensive self versus descendant work. Account for dropped records and omitted tree nodes, then recommend specific React changes with evidence.",
    metadata: createMetadata(session, endedAt),
    renders: session.rawRecords,
    componentTree,
    totalTreeNodeCount: session.componentTreeNodes.size + session.omittedTreeNodeCount,
    omittedTreeNodeCount: session.omittedTreeNodeCount,
    truncated: session.droppedRecordCount > 0,
    droppedRecordCount: session.droppedRecordCount,
  };
};

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
    console.error(REACT_SCAN_PRO_LOG_PREFIX, "The report callback threw.", error);
  }

  for (const listener of Array.from(reportListeners)) {
    try {
      listener(report);
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.error(REACT_SCAN_PRO_LOG_PREFIX, "A report listener threw.", error);
    }
  }

  notifyReportStoreListeners(report);
};

const collectReportElements = (session: ReportSessionState, fiber: Fiber) => {
  const remainingElementCount = REPORT_HIGHLIGHT_MAX_ELEMENTS - session.highlightElementCount;
  if (remainingElementCount <= 0 || typeof Element === "undefined") return [];

  const maxElementCount = Math.min(remainingElementCount, REPORT_HIGHLIGHT_MAX_ELEMENTS_PER_ITEM);
  const elements = getNearestHostElements(fiber, maxElementCount);
  session.highlightElementCount += elements.length;
  return elements;
};

const updateComponentElements = (
  session: ReportSessionState,
  componentTypeId: string,
  fiberId: number,
  fiber: Fiber,
  phase: RawRenderRecord["phase"],
) => {
  const instanceElements = session.componentElements.get(componentTypeId);
  const previousElements = instanceElements?.get(fiberId);

  if (phase === "unmount") {
    if (!instanceElements || !previousElements) return;
    session.highlightElementCount -= previousElements.length;
    instanceElements.delete(fiberId);
    if (instanceElements.size === 0) session.componentElements.delete(componentTypeId);
    return;
  }

  if (previousElements) return;

  const nextElements = collectReportElements(session, fiber);
  if (nextElements.length === 0) return;
  const nextInstanceElements = instanceElements ?? new Map<number, Array<Element>>();
  nextInstanceElements.set(fiberId, nextElements);
  if (!instanceElements) session.componentElements.set(componentTypeId, nextInstanceElements);
};

const saveRawRecordElements = (session: ReportSessionState, sequence: number, fiber: Fiber) => {
  const elements = collectReportElements(session, fiber);
  if (elements.length > 0) session.rawRecordElements.set(sequence, elements);
};

const saveReportElements = (session: ReportSessionState) => {
  const rawRecordElements = new Map<number, Array<Element>>();
  for (const [sequence, elements] of session.rawRecordElements) {
    const connectedElements = elements.filter((element) => element.isConnected);
    if (connectedElements.length > 0) rawRecordElements.set(sequence, connectedElements);
  }

  lastReportElements = {
    sessionId: session.sessionId,
    componentElements: new Map(
      Array.from(session.componentElements, ([componentTypeId, instanceElements]) => [
        componentTypeId,
        Array.from(instanceElements.values())
          .flat()
          .filter((element) => element.isConnected),
      ]),
    ),
    rawRecordElements,
  };
};

const releaseSessionMemory = (session: ReportSessionState, report: ScanSessionReport) => {
  session.matchedScopeRootIds.clear();
  session.primitiveComponentTypeIds.clear();
  session.componentSummaries.clear();
  session.componentTreeNodes.clear();
  session.componentElements.clear();
  session.rawRecordElements.clear();
  session.highlightElementCount = 0;
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
  saveReportElements(session);
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
  if (!session) return false;

  const scopeMatch = getScopeMatch(fiber, session.scope);
  if (!scopeMatch.isMatch) return false;
  if (scopeMatch.rootFiberId !== null) {
    session.matchedScopeRootIds.add(scopeMatch.rootFiberId);
  }
  const treeNode = ensureComponentTreeNode(session, fiber);
  const componentName = treeNode?.componentName ?? getComponentName(fiber);

  let componentTypeId: string | undefined;
  let fiberId: number | undefined;
  let parentFiberId: number | null | undefined;
  const getRecordIdentity = () => {
    componentTypeId ??= treeNode?.componentTypeId ?? getComponentTypeId(session, fiber);
    fiberId ??= treeNode?.fiberId ?? getFiberId(fiber);
    return { componentTypeId, fiberId };
  };
  const getRecordParentFiberId = () => {
    if (parentFiberId !== undefined) return parentFiberId;
    if (treeNode) {
      parentFiberId = treeNode.parentFiberId;
      return parentFiberId;
    }
    const parentComponentFiber = getParentComponentFiber(fiber);
    parentFiberId = parentComponentFiber ? getFiberId(parentComponentFiber) : null;
    return parentFiberId;
  };

  for (const render of renders) {
    const phase = getPhaseName(render.phase);
    const renderCount = getRenderCount(render);
    if (treeNode) recordTreeNodeRender(treeNode, render, renderCount);
    if (phase === "unmount") session.observedUnmountCount += renderCount;
    else session.observedRenderCount += renderCount;

    if (session.reportOptions.mode === "raw") {
      const maxRecords = session.reportOptions.maxRecords ?? DEFAULT_RAW_REPORT_MAX_RECORDS;
      if (session.rawRecords.length < maxRecords) {
        const identity = getRecordIdentity();
        const sequence = ++session.sequence;
        session.rawRecords.push({
          sequence,
          timestamp: Date.now(),
          commitIndex: session.commitIndex,
          ...identity,
          parentFiberId: getRecordParentFiberId(),
          componentName,
          phase,
          renderCount,
          selfTime: render.selfTime,
          totalTime: render.totalTime,
          fps: render.fps,
          didCommit: render.didCommit,
          reasons: createRenderReasons(render),
        });
        if (phase !== "unmount") saveRawRecordElements(session, sequence, fiber);
      } else {
        session.droppedRecordCount++;
      }
      continue;
    }

    const identity = getRecordIdentity();
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
    const isNewInstance = !summary.fiberIds.has(identity.fiberId);
    summary.fiberIds.add(identity.fiberId);
    if (isNewInstance || phase === "unmount") {
      updateComponentElements(session, identity.componentTypeId, identity.fiberId, fiber, phase);
    }
    if (phase === "mount") summary.mountCount += renderCount;
    else if (phase === "update") summary.updateCount += renderCount;
    else summary.unmountCount += renderCount;
    if (phase !== "unmount") {
      const selfTime = render.selfTime ?? 0;
      summary.totalSelfTime += selfTime;
      summary.maxSelfTime = Math.max(summary.maxSelfTime, selfTime);
      summary.totalTime += render.totalTime ?? 0;
    }
    recordSummaryReasons(summary, render, renderCount);
  }

  return true;
};

export const subscribeToReports = (listener: ScanReportListener) => {
  reportListeners.add(listener);
  return () => {
    reportListeners.delete(listener);
  };
};

// Passive subscriptions are used by the toolbar UI. Unlike public onReport
// listeners, they do not implicitly start an otherwise unconfigured session.
export const subscribeToReportStore = (listener: ScanReportStoreListener) => {
  reportStoreListeners.add(listener);
  return () => {
    reportStoreListeners.delete(listener);
  };
};

export const getLastReport = () => lastReport;

export const getLastReportElements = (itemId: string | number) => {
  if (!lastReport || lastReportElements?.sessionId !== lastReport.metadata.sessionId) return [];
  return typeof itemId === "string"
    ? (lastReportElements.componentElements.get(itemId) ?? [])
    : (lastReportElements.rawRecordElements.get(itemId) ?? []);
};

export const clearLastReport = () => {
  lastReport = null;
  lastReportElements = null;
  notifyReportStoreListeners(null);
};

export const resetReportingForTests = () => {
  activeSession = null;
  lastReport = null;
  lastReportElements = null;
  nextSessionId = 0;
  reportListeners.clear();
  reportStoreListeners.clear();
};
