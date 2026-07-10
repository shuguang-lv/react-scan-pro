import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  type ComponentRenderSummary,
  type RawRenderReason,
  type RawRenderRecord,
  type ScanSessionReport,
  getLastReport,
  subscribeToReportStore,
} from "~core/reporting";
import { Icon } from "~web/components/icon";
import { useVirtualList } from "~web/hooks/use-virtual-list";
import { signalWidgetViews } from "~web/state";
import { cn } from "~web/utils/helpers";

const RAW_ROW_HEIGHT = 58;

const formatDuration = (value: number) => `${value.toFixed(value >= 10 ? 1 : 2)}ms`;

const serializeReport = (report: ScanSessionReport) => JSON.stringify(report, null, 2);

const getReportFileName = (report: ScanSessionReport) =>
  `react-scan-pro-${report.metadata.sessionId}.json`;

const downloadReport = (report: ScanSessionReport) => {
  const url = URL.createObjectURL(
    new Blob([serializeReport(report)], { type: "application/json;charset=utf-8" }),
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
      "flex items-center gap-x-1.5 rounded-sm border border-[#34343b]",
      "bg-[#18181B] px-2 py-1 text-[10px] text-zinc-300",
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
    const timeout = setTimeout(() => setCopyState("idle"), 1200);
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
          title="Copy report JSON"
          disabled={!report}
          onClick={copyReport}
        >
          <Icon name={copyState === "copied" ? "icon-check" : "icon-copy"} size={12} />
          {copyState === "copied" ? "Copied" : copyState === "error" ? "Failed" : "Copy"}
        </PanelButton>
        <PanelButton
          testId="export-session-report"
          title="Export report as JSON"
          disabled={!report}
          onClick={() => report && downloadReport(report)}
        >
          <Icon name="icon-gallery-horizontal-end" size={12} />
          Export JSON
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
      <SummaryReportView components={report.components} />
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

const SummaryReportView = ({ components }: { components: Array<ComponentRenderSummary> }) => (
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

const SummaryRow = ({ item }: { item: ComponentRenderSummary }) => (
  <div className="border-b border-[#202024] px-3 py-2 hover:bg-[#141416]">
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
    estimateSize: () => RAW_ROW_HEIGHT,
    getScrollElement,
    overscan: 8,
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
    style={{ height: `${RAW_ROW_HEIGHT}px`, transform: `translateY(${top}px)` }}
  >
    <div className="flex items-center gap-x-2">
      <span className="min-w-0 flex-1 truncate font-medium text-zinc-200">
        #{record.sequence} {record.componentName}
      </span>
      <span className="rounded-sm bg-[#27272A] px-1 text-[8px] uppercase text-zinc-400">
        {record.phase}
      </span>
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
