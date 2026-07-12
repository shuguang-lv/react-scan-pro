import { decode } from "@toon-format/toon";
import { describe, expect, it } from "vitest";
import type { SummaryScanReport } from "~core/reporting";
import { serializeReport } from "./serialize-report";

describe("serializeReport", () => {
  it("creates a lossless TOON report", () => {
    const report: SummaryScanReport = {
      mode: "summary",
      schemaVersion: 1,
      metadata: {
        sessionId: "scan-1",
        startedAt: 1,
        endedAt: 2,
        durationMs: 1,
        observedRenderCount: 0,
        observedUnmountCount: 0,
        matchedScopeRootCount: 0,
      },
      components: [],
      componentTree: [],
      totalComponentTypeCount: 0,
      omittedComponentTypeCount: 0,
      totalTreeNodeCount: 0,
      omittedTreeNodeCount: 0,
      prompt: "Analyze this report.",
    };

    const serializedReport = serializeReport(report);

    expect(serializedReport).not.toContain("{\n");
    expect(decode(serializedReport)).toEqual(report);
  });
});
