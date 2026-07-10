import "./polyfills";
// Prioritize bippy side-effect
import "bippy";

import { IS_CLIENT } from "~web/utils/constants";
import { getLastReport, getOptions, onReport, scan, setOptions } from "./index";

if (IS_CLIENT) {
  const reactScanPro = Object.assign(scan, {
    scan,
    setOptions,
    getOptions,
    onReport,
    getLastReport,
  });
  window.reactScanPro = reactScanPro;
  window.reactScan = reactScanPro;
  scan(window.__REACT_SCAN_PRO_OPTIONS__ ?? {});
}

export * from "./core";
