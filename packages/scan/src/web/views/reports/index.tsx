import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  type ComponentRenderSummary,
  type ComponentTreeNode,
  type RawRenderReason,
  type RawRenderRecord,
  type ScanSessionReport,
  clearLastReport,
  getLastReport,
  getLastReportElements,
  subscribeToReportStore,
} from "~core/reporting";
import { Icon } from "~web/components/icon";
import { useVirtualList } from "~web/hooks/use-virtual-list";
import { signalWidgetViews } from "~web/state";
import { fadeOutHighlights } from "~web/utils/fade-out-highlights";
import { cn } from "~web/utils/helpers";
import { highlightElements } from "~web/utils/highlight-elements";
import { ClearIcon } from "../notifications/icons";
import {
  RAW_REPORT_ROW_HEIGHT_PX,
  REPORT_COPY_STATE_DURATION_MS,
  REPORT_LIST_OVERSCAN_COUNT,
  REPORT_TREE_BAR_MAX_WIDTH_PERCENT,
  REPORT_TREE_BAR_MIN_WIDTH_PERCENT,
  REPORT_TREE_INDENT_PX,
  REPORT_TREE_MIN_WIDTH_PX,
} from "./constants";
import { getCollapsedAncestorPath } from "./utils/get-collapsed-ancestor-path";
import { getDefaultExpandedNodeIds } from "./utils/get-default-expanded-node-ids";
import { getMaxTreeTime } from "./utils/get-max-tree-time";
import { serializeReport } from "./utils/serialize-report";

interface SummaryReportViewProps {
  components: Array<ComponentRenderSummary>;
  componentTree: Array<ComponentTreeNode>;
  omittedTreeNodeCount: number;
}

interface TreeReportViewProps {
  roots: Array<ComponentTreeNode>;
  omittedTreeNodeCount: number;
}

interface TreeRowProps {
  node: ComponentTreeNode;
  depth: number;
  maxTime: number;
  expandedNodeIds: Set<number>;
  onToggle: (fiberId: number) => void;
  onFocus: (node: ComponentTreeNode) => void;
}

const REPORT_VIEW_MODES: Array<"list" | "tree"> = ["list", "tree"];

const formatDuration = (value: number) => {
  if (value > 0 && value < 0.01) return "<0.01ms";
  return `${value.toFixed(value >= 10 ? 1 : 2)}ms`;
};

const getReportFileName = (report: ScanSessionReport) =>
  `react-scan-pro-${report.metadata.sessionId}.toon`;

const downloadReport = (report: ScanSessionReport) => {
  const url = URL.createObjectURL(
    new Blob([serializeReport(report)], { type: "text/toon;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = getReportFileName(report);
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const PanelButton = ({
  children,
  disabled,
  onClick,
  testId,
  title,
}: {
  children: preact.ComponentChildren;
  disabled?: boolean;
  onClick: () => void;
  testId: string;
  title: string;
}) => (
  <button
    type="button"
    data-testid={testId}
    title={title}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      "flex size-6 items-center justify-center rounded-sm border border-[#34343b]",
      "bg-[#18181B] text-zinc-300",
      "hover:bg-[#27272A] disabled:cursor-not-allowed disabled:opacity-40",
    )}
  >
    {children}
  </button>
);

export const ReportsPanel = () => {
  const [report, setReport] = useState<ScanSessionReport | null>(() => getLastReport());
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => subscribeToReportStore(setReport), []);

  useEffect(() => {
    if (copyState === "idle") return;
    const timeout = setTimeout(() => setCopyState("idle"), REPORT_COPY_STATE_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [copyState]);

  const copyReport = useCallback(() => {
    if (!report) return;
    navigator.clipboard.writeText(serializeReport(report)).then(
      () => setCopyState("copied"),
      () => setCopyState("error"),
    );
  }, [report]);

  return (
    <div className="flex h-full w-full flex-col bg-[#0A0A0A]" data-testid="session-reports-panel">
      <div className="flex min-h-[44px] items-center gap-x-2 border-b border-[#27272A] px-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-zinc-100">Session report</div>
          <div className="truncate text-[9px] text-zinc-500">
            {report
              ? `${report.mode.toUpperCase()} · ${new Date(report.metadata.endedAt).toLocaleTimeString()}`
              : "No completed capture"}
          </div>
        </div>
        <PanelButton
          testId="copy-session-report"
          title={
            copyState === "copied"
              ? "Report copied"
              : copyState === "error"
                ? "Failed to copy report"
                : "Copy report as TOON"
          }
          disabled={!report}
          onClick={copyReport}
        >
          <Icon
            name={
              copyState === "copied"
                ? "icon-check"
                : copyState === "error"
                  ? "icon-triangle-alert"
                  : "icon-copy"
            }
            size={12}
          />
        </PanelButton>
        <PanelButton
          testId="export-session-report"
          title="Export report as TOON"
          disabled={!report}
          onClick={() => report && downloadReport(report)}
        >
          <Icon name="icon-gallery-horizontal-end" size={12} />
        </PanelButton>
        <PanelButton
          testId="clear-session-report"
          title="Clear session report"
          disabled={!report}
          onClick={() => {
            fadeOutHighlights();
            clearLastReport();
          }}
        >
          <ClearIcon size={12} />
        </PanelButton>
        <button
          type="button"
          title="Close"
          className="flex size-6 items-center justify-center text-zinc-500 hover:text-white"
          onClick={() => {
            signalWidgetViews.value = { view: "none" };
          }}
        >
          <Icon name="icon-close" size={14} />
        </button>
      </div>

      {report ? <ReportContent report={report} /> : <EmptyReport />}
    </div>
  );
};

const EmptyReport = () => (
  <div className="flex h-full flex-col items-center justify-center gap-y-2 px-8 text-center">
    <Icon name="icon-gallery-horizontal-end" size={24} className="text-zinc-600" />
    <p className="text-xs font-medium text-zinc-300">No completed session report</p>
    <p className="max-w-sm text-[10px] leading-4 text-zinc-600">
      Configure the report option or register an onReport listener, enable scanning, then disable it
      to complete the capture window.
    </p>
  </div>
);

const ReportContent = ({ report }: { report: ScanSessionReport }) => (
  <div className="flex min-h-0 flex-1 flex-col">
    <ReportMetadata report={report} />
    {report.mode === "summary" ? (
      <SummaryReportView
        key={report.metadata.sessionId}
        components={report.components}
        componentTree={report.componentTree}
        omittedTreeNodeCount={report.omittedTreeNodeCount}
      />
    ) : (
      <RawReportView records={report.renders} />
    )}
  </div>
);

const ReportMetadata = ({ report }: { report: ScanSessionReport }) => {
  const metrics = [
    ["Duration", formatDuration(report.metadata.durationMs)],
    ["Renders", String(report.metadata.observedRenderCount)],
    ["Unmounts", String(report.metadata.observedUnmountCount)],
    ["Scope roots", String(report.metadata.matchedScopeRootCount)],
  ] as const;

  return (
    <div className="grid grid-cols-4 gap-px border-b border-[#27272A] bg-[#27272A]">
      {metrics.map(([label, value]) => (
        <div key={label} className="bg-[#111113] px-2 py-1.5">
          <div className="text-[8px] uppercase tracking-wide text-zinc-600">{label}</div>
          <div className="truncate text-[11px] font-medium text-zinc-200">{value}</div>
        </div>
      ))}
    </div>
  );
};

const SummaryReportView = ({
  components,
  componentTree,
  omittedTreeNodeCount,
}: SummaryReportViewProps) => {
  const [viewMode, setViewMode] = useState<"list" | "tree">("list");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end border-b border-[#27272A] bg-[#111113] px-3 py-1">
        <div className="flex rounded-sm border border-[#34343b] bg-[#18181B] p-0.5">
          {REPORT_VIEW_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              title={`Show ${mode} view`}
              onClick={() => setViewMode(mode)}
              className={cn(
                "flex h-5 items-center gap-x-1 rounded-sm px-2 text-[9px] capitalize",
                viewMode === mode
                  ? "bg-[#34343b] text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-200",
              )}
            >
              <Icon
                name={mode === "tree" ? "icon-flame" : "icon-gallery-horizontal-end"}
                size={10}
              />
              {mode}
            </button>
          ))}
        </div>
      </div>
      {viewMode === "list" ? (
        <SummaryList components={components} />
      ) : (
        <TreeReportView roots={componentTree} omittedTreeNodeCount={omittedTreeNodeCount} />
      )}
    </div>
  );
};

const SummaryList = ({ components }: { components: Array<ComponentRenderSummary> }) => (
  <div className="min-h-0 flex-1 overflow-auto" data-testid="summary-report-list">
    <div className="sticky top-0 z-10 grid grid-cols-[minmax(120px,2fr)_repeat(4,minmax(64px,1fr))] border-b border-[#27272A] bg-[#18181B] px-3 py-1.5 text-[9px] uppercase text-zinc-500">
      <span>Component</span>
      <span className="text-right">Renders</span>
      <span className="text-right">Avg self</span>
      <span className="text-right">Max self</span>
      <span className="text-right">Avg subtree</span>
    </div>
    {components.length === 0 ? (
      <div className="p-6 text-center text-[10px] text-zinc-600">No renders in this session.</div>
    ) : (
      components.map((component) => <SummaryRow key={component.componentTypeId} item={component} />)
    )}
  </div>
);

const TreeReportView = ({ roots, omittedTreeNodeCount }: TreeReportViewProps) => {
  const [focusedNode, setFocusedNode] = useState<ComponentTreeNode | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<number>>(() =>
    getDefaultExpandedNodeIds(roots),
  );
  const visibleRoots = focusedNode ? [focusedNode] : roots;
  const maxTime = getMaxTreeTime(visibleRoots);

  const toggleExpanded = (fiberId: number) => {
    setExpandedNodeIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(fiberId)) nextIds.delete(fiberId);
      else nextIds.add(fiberId);
      return nextIds;
    });
  };

  const focusNode = (node: ComponentTreeNode) => {
    setExpandedNodeIds((currentIds) => new Set([...currentIds, node.fiberId]));
    setFocusedNode(node);
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto" data-testid="summary-report-tree">
      <div
        className="sticky top-0 z-10 flex h-7 items-center border-b border-[#27272A] bg-[#18181B] px-3 text-[9px] text-zinc-500"
        style={{ minWidth: `${REPORT_TREE_MIN_WIDTH_PX}px` }}
      >
        <div className="flex min-w-0 flex-1 items-center">
          {focusedNode ? (
            <button
              type="button"
              title="Show full component tree"
              className="flex min-w-0 items-center gap-x-1 text-zinc-300 hover:text-white"
              onClick={() => setFocusedNode(null)}
            >
              <Icon name="icon-chevron-right" size={10} className="rotate-180" />
              <span className="truncate">{focusedNode.componentName}</span>
            </button>
          ) : (
            <span className="truncate">Component hierarchy · line reflects subtree time</span>
          )}
          {omittedTreeNodeCount > 0 && (
            <span className="ml-2 text-amber-500">{omittedTreeNodeCount} omitted</span>
          )}
        </div>
        <span className="w-16 text-right" title="Renders for this component instance">
          Renders
        </span>
        <span className="ml-3 w-16 text-right">Self total</span>
        <span className="ml-3 w-20 text-right">Subtree total</span>
      </div>
      {visibleRoots.length === 0 ? (
        <div className="p-6 text-center text-[10px] text-zinc-600">No renders in this session.</div>
      ) : (
        visibleRoots.map((node) => (
          <TreeRow
            key={node.fiberId}
            node={node}
            depth={0}
            maxTime={maxTime}
            expandedNodeIds={expandedNodeIds}
            onToggle={toggleExpanded}
            onFocus={focusNode}
          />
        ))
      )}
    </div>
  );
};

const TreeRow = ({ node, depth, maxTime, expandedNodeIds, onToggle, onFocus }: TreeRowProps) => {
  const ancestorPath = getCollapsedAncestorPath(node);
  const displayedNode = ancestorPath.at(-1) ?? node;
  const isAncestorPath = !node.didRender;
  const isExpanded = expandedNodeIds.has(displayedNode.fiberId);
  const fullPathLabel = ancestorPath.map((ancestorNode) => ancestorNode.componentName).join(" / ");
  const firstAncestor = ancestorPath[0] ?? node;
  const componentLabel =
    ancestorPath.length > 2
      ? `${firstAncestor.componentName} / ... / ${displayedNode.componentName}`
      : fullPathLabel;
  const widthPercent = Math.max(
    REPORT_TREE_BAR_MIN_WIDTH_PERCENT,
    maxTime > 0
      ? (displayedNode.totalTime / maxTime) * REPORT_TREE_BAR_MAX_WIDTH_PERCENT
      : REPORT_TREE_BAR_MAX_WIDTH_PERCENT,
  );

  return (
    <>
      <div
        data-testid="report-tree-row"
        data-component-name={displayedNode.componentName}
        data-render-count={displayedNode.renderCount}
        data-self-time={displayedNode.totalSelfTime}
        data-subtree-time={displayedNode.totalTime}
        className={cn(
          "relative flex h-8 items-center border-b border-[#202024] pr-3 text-[9px] hover:bg-[#17171A]",
          isAncestorPath ? "text-zinc-500" : "text-zinc-200",
        )}
        style={{
          minWidth: `${REPORT_TREE_MIN_WIDTH_PX}px`,
          paddingLeft: `${depth * REPORT_TREE_INDENT_PX + 6}px`,
        }}
        onMouseEnter={() => {
          if (displayedNode.didRender) {
            void highlightElements(
              displayedNode.componentName,
              getLastReportElements(displayedNode.componentTypeId),
            );
          }
        }}
        onMouseLeave={fadeOutHighlights}
      >
        <div
          className={cn(
            "absolute bottom-0 left-0 h-px",
            isAncestorPath ? "bg-zinc-600/40" : "bg-emerald-400/60",
          )}
          style={{ width: `${widthPercent}%` }}
        />
        <button
          type="button"
          title={isExpanded ? "Collapse descendants" : "Expand descendants"}
          disabled={displayedNode.children.length === 0}
          className="relative flex size-5 items-center justify-center text-zinc-500 disabled:opacity-0"
          onClick={() => onToggle(displayedNode.fiberId)}
        >
          <Icon name="icon-chevron-right" size={10} className={isExpanded ? "rotate-90" : ""} />
        </button>
        <button
          type="button"
          title="Focus this subtree"
          className="relative min-w-0 flex-1 truncate text-left font-medium hover:text-white"
          onClick={() => onFocus(displayedNode)}
        >
          <span title={fullPathLabel}>{componentLabel}</span>
          {isAncestorPath && (
            <span className="ml-1 text-[8px] font-normal text-zinc-600">
              {ancestorPath.length === 1 ? "ancestor" : `${ancestorPath.length} ancestors`}
            </span>
          )}
        </button>
        <span
          className={cn(
            "relative ml-2 w-16 text-right",
            isAncestorPath ? "text-zinc-700" : "text-zinc-300",
          )}
          title={isAncestorPath ? "This ancestor did not render" : "Component renders"}
        >
          {isAncestorPath ? "-" : displayedNode.renderCount}
        </span>
        <span
          className={cn(
            "relative ml-3 w-16 text-right",
            isAncestorPath ? "text-zinc-700" : "text-zinc-500",
          )}
          title={isAncestorPath ? "This ancestor did not render" : undefined}
        >
          {isAncestorPath ? "-" : formatDuration(displayedNode.totalSelfTime)}
        </span>
        <span className="relative ml-3 w-20 text-right text-zinc-400">
          {formatDuration(displayedNode.totalTime)}
        </span>
      </div>
      {isExpanded &&
        displayedNode.children.map((childNode) => (
          <TreeRow
            key={childNode.fiberId}
            node={childNode}
            depth={depth + 1}
            maxTime={maxTime}
            expandedNodeIds={expandedNodeIds}
            onToggle={onToggle}
            onFocus={onFocus}
          />
        ))}
    </>
  );
};

const SummaryRow = ({ item }: { item: ComponentRenderSummary }) => (
  <div
    data-testid="summary-report-row"
    data-component-name={item.componentName}
    data-render-count={item.renderCount}
    data-average-self-time={item.averageSelfTime}
    data-average-subtree-time={item.averageTotalTime}
    className="border-b border-[#202024] px-3 py-2 hover:bg-[#141416]"
    onMouseEnter={() => {
      void highlightElements(item.componentName, getLastReportElements(item.componentTypeId));
    }}
    onMouseLeave={fadeOutHighlights}
  >
    <div className="grid grid-cols-[minmax(120px,2fr)_repeat(4,minmax(64px,1fr))] items-center text-[10px]">
      <div className="min-w-0 pr-2">
        <div className="truncate font-medium text-zinc-200">{item.componentName}</div>
        <div className="truncate text-[8px] text-zinc-600">
          {item.instanceCount} instance{item.instanceCount === 1 ? "" : "s"} · {item.mountCount}m ·{" "}
          {item.updateCount}u · {item.unmountCount}x
        </div>
      </div>
      <span className="text-right text-zinc-300">{item.renderCount}</span>
      <span className="text-right text-zinc-400">{formatDuration(item.averageSelfTime)}</span>
      <span className="text-right text-zinc-400">{formatDuration(item.maxSelfTime)}</span>
      <span className="text-right text-zinc-400">{formatDuration(item.averageTotalTime)}</span>
    </div>
    {item.reasons.length > 0 && (
      <div className="mt-1 flex flex-wrap gap-1">
        {item.reasons.slice(0, 8).map((reason) => (
          <span
            key={`${reason.kind}:${reason.name ?? ""}`}
            className="rounded-sm bg-[#27272A] px-1.5 py-0.5 text-[8px] text-zinc-400"
          >
            {reason.kind}
            {reason.name ? `:${reason.name}` : ""} ×{reason.count}
          </span>
        ))}
      </div>
    )}
  </div>
);

const RawReportView = ({ records }: { records: Array<RawRenderRecord> }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const getScrollElement = useCallback(() => scrollRef.current, []);
  const { virtualItems, totalSize } = useVirtualList({
    count: records.length,
    estimateSize: () => RAW_REPORT_ROW_HEIGHT_PX,
    getScrollElement,
    overscan: REPORT_LIST_OVERSCAN_COUNT,
  });

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" data-testid="raw-report-list">
      {records.length === 0 ? (
        <div className="p-6 text-center text-[10px] text-zinc-600">No renders in this session.</div>
      ) : (
        <div className="relative w-full" style={{ height: `${totalSize}px` }}>
          {virtualItems.map((virtualItem) => {
            const record = records[virtualItem.index];
            return <RawRow key={record.sequence} record={record} top={virtualItem.start} />;
          })}
        </div>
      )}
    </div>
  );
};

const formatReasons = (reasons: Array<RawRenderReason>) =>
  reasons.map((reason) => `${reason.kind}${reason.name ? `:${reason.name}` : ""}`).join(", ");

const RawRow = ({ record, top }: { record: RawRenderRecord; top: number }) => (
  <div
    className="absolute left-0 right-0 border-b border-[#202024] px-3 py-1.5 text-[9px] hover:bg-[#141416]"
    style={{ height: `${RAW_REPORT_ROW_HEIGHT_PX}px`, transform: `translateY(${top}px)` }}
    onMouseEnter={() => {
      void highlightElements(record.componentName, getLastReportElements(record.sequence));
    }}
    onMouseLeave={fadeOutHighlights}
  >
    <div className="flex items-center gap-x-2">
      <span className="min-w-0 flex-1 truncate font-medium text-zinc-200">
        #{record.sequence} {record.componentName}
      </span>
      <span className="rounded-sm bg-[#27272A] px-1 text-[8px] uppercase text-zinc-400">
        {record.phase}
      </span>
      {record.renderCount > 1 && <span className="text-zinc-400">×{record.renderCount}</span>}
      <span className="text-zinc-500">commit {record.commitIndex}</span>
    </div>
    <div className="mt-1 flex gap-x-3 text-zinc-500">
      <span>self {formatDuration(record.selfTime ?? 0)}</span>
      <span>subtree {formatDuration(record.totalTime ?? 0)}</span>
      <span>{record.fps} FPS</span>
      <span className="min-w-0 flex-1 truncate">
        {formatReasons(record.reasons) || "no reason"}
      </span>
    </div>
  </div>
);
