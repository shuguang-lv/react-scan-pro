import { encode } from "@toon-format/toon";
import type { ScanSessionReport } from "~core/reporting";

export const serializeReport = (report: ScanSessionReport) => encode(report, { delimiter: "\t" });
