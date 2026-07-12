import type { Change } from "~core/index";
import { ChangeReason, type Render, RenderPhase, isValueUnstable } from "~core/instrumentation";
import { createReportValuePreview } from "~core/reporting";
import { REACT_SCAN_PRO_LOG_PREFIX } from "../../logging-constants";

interface RenderLogReason {
  kind: "props" | "state" | "context";
  name: string;
  unstable: boolean;
  previous: string;
  current: string;
}

interface RenderLogEntry {
  component: string;
  phase: "mount" | "update" | "unmount";
  renderCount: number;
  selfTimeMs: number | null;
  subtreeTimeMs: number | null;
  fps: number;
  didCommit: boolean;
  parentRendered: boolean;
  unnecessary: boolean | null;
  reasons: Array<RenderLogReason>;
}

const getChangeKind = (change: Change): RenderLogReason["kind"] => {
  if (change.type === ChangeReason.Props) return "props";
  if (change.type === ChangeReason.Context) return "context";
  return "state";
};

const getPhase = (render: Render): RenderLogEntry["phase"] => {
  if (render.phase === RenderPhase.Mount) return "mount";
  if (render.phase === RenderPhase.Unmount) return "unmount";
  return "update";
};

const createLogEntry = (render: Render): RenderLogEntry => ({
  component: render.componentName ?? "Anonymous",
  phase: getPhase(render),
  renderCount: render.count,
  selfTimeMs: render.selfTime,
  subtreeTimeMs: render.totalTime,
  fps: render.fps,
  didCommit: render.didCommit,
  parentRendered: render.parentRendered,
  unnecessary: render.unnecessary,
  reasons: render.changes.map((change) => ({
    kind: getChangeKind(change),
    name: change.name,
    unstable: isValueUnstable(change.prevValue, change.value),
    previous: createReportValuePreview(change.prevValue).preview,
    current: createReportValuePreview(change.value).preview,
  })),
});

export const log = (renders: Array<Render>, namespace: "notification" | "session-report") => {
  for (const render of renders) {
    if (!render.componentName) continue;
    const entry = createLogEntry(render);
    // oxlint-disable-next-line no-console
    console.groupCollapsed(
      `${REACT_SCAN_PRO_LOG_PREFIX} [${namespace}] ${entry.component} · ${entry.phase} · ${entry.selfTimeMs ?? 0}ms self`,
    );
    // oxlint-disable-next-line no-console
    console.log(`${REACT_SCAN_PRO_LOG_PREFIX} [${namespace}] render-analysis`, entry);
    // oxlint-disable-next-line no-console
    console.groupEnd();
  }
};

export const logIntro = () => {
  if (window.hideIntro) {
    window.hideIntro = undefined;
    return;
  }
  // oxlint-disable-next-line no-console
  console.log(
    `${REACT_SCAN_PRO_LOG_PREFIX} %c[·] %cReact Scan Pro`,
    "font-weight:bold;color:#7a68e8;font-size:20px;",
    "font-weight:bold;font-size:14px;",
  );
};
