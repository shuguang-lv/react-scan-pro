import { type Signal, signal } from "@preact/signals";
import {
  type Fiber,
  detectReactBuildType,
  getRDTHook,
  getType,
  isInstrumentationActive,
} from "bippy";
import type { ComponentType } from "preact";
import type { ReactNode } from "preact/compat";
import type { RenderData } from "src/core/utils";
import { initReactScanInstrumentation } from "src/new-outlines";
import styles from "~web/assets/css/styles.css";
import { createToolbar } from "~web/toolbar";
import { IS_CLIENT } from "~web/utils/constants";
import { checkReactGrabVersion } from "~web/utils/check-react-grab-version";
import { readLocalStorage, saveLocalStorage } from "~web/utils/helpers";
import { parseSafeAreaOption } from "~web/utils/parse-safe-area-option";
import type { States } from "~web/views/inspector/utils";
import type { ChangeReason, Render, createInstrumentation } from "./instrumentation";
import { startTimingTracking } from "./notifications/event-tracking";
import { createHighlightCanvas } from "./notifications/outline-overlay";
import {
  ensureReportSession,
  getLastReport as getStoredLastReport,
  subscribeToReports,
  syncReportSession,
} from "./reporting";
import type {
  RawReportOptions,
  RawScanReport,
  ScanReportListener,
  ScanReportOptions,
  ScanSessionReport,
  SummaryReportOptions,
  SummaryScanReport,
} from "./reporting";
import type { ScanScope, ScanScopeCandidate } from "./scope";
import packageJson from "../../package.json";
import { REACT_SCAN_PRO_LOG_PREFIX } from "../logging-constants";

export type {
  RawReportOptions,
  RawScanReport,
  ScanReportListener,
  ScanReportOptions,
  ScanScope,
  ScanScopeCandidate,
  ScanSessionReport,
  SummaryReportOptions,
  SummaryScanReport,
};

const STORAGE_KEY = "react-scan-pro-options";
const LEGACY_STORAGE_KEY = "react-scan-options";

let rootContainer: HTMLDivElement | null = null;
let shadowRoot: ShadowRoot | null = null;

interface RootContainer {
  rootContainer: HTMLDivElement;
  shadowRoot: ShadowRoot;
}

const initRootContainer = (): RootContainer => {
  if (rootContainer && shadowRoot) {
    return { rootContainer, shadowRoot };
  }

  rootContainer = document.createElement("div");
  rootContainer.id = "react-scan-pro-root";

  shadowRoot = rootContainer.attachShadow({ mode: "open" });

  const cssStyles = document.createElement("style");
  cssStyles.textContent = styles;

  shadowRoot.appendChild(cssStyles);

  document.documentElement.appendChild(rootContainer);

  return { rootContainer, shadowRoot };
};

export interface Options {
  /**
   * Enable/disable scanning
   *
   * Please use the recommended way:
   * enabled: process.env.NODE_ENV === 'development',
   *
   * @default true
   */
  enabled?: boolean;

  scope?: ScanScope | Array<ScanScope>;

  report?: ScanReportOptions;

  /**
   * Force React Scan Pro to run in production (not recommended)
   *
   * @default false
   */
  dangerouslyForceRunInProduction?: boolean;
  /**
   * Log renders to the console
   *
   * WARNING: This can add significant overhead when the app re-renders frequently
   *
   * @default false
   */
  log?: boolean;

  /**
   * Show toolbar bar
   *
   * If you set this to true, and set {@link enabled} to false, the toolbar will still show, but scanning will be disabled.
   *
   * @default true
   */
  showToolbar?: boolean;

  /**
   * Animation speed
   *
   * @default "fast"
   */
  animationSpeed?: "slow" | "fast" | "off";

  /**
   * Track unnecessary renders, and mark their outlines gray when detected
   *
   * An unnecessary render is defined as the component re-rendering with no change to the component's
   * corresponding dom subtree
   *
   *  @default false
   *  @warning tracking unnecessary renders can add meaningful overhead to react-scan-pro
   */
  trackUnnecessaryRenders?: boolean;

  /**
   * Should the FPS meter show in the toolbar
   *
   *  @default true
   */
  showFPS?: boolean;

  /**
   * Should the number of slowdown notifications be shown in the toolbar
   *
   *  @default true
   */
  showNotificationCount?: boolean;

  /**
   * Allow React Scan Pro to run inside iframes
   *
   * @default false
   */
  allowInIframe?: boolean;

  /**
   * Distance (in pixels) the toolbar keeps from the viewport edges. Useful
   * when other dev overlays (e.g. the Next.js dev indicator) sit in the same
   * corner. Pass a single number to inset all edges, or an object to inset
   * edges individually.
   *
   * @default 24
   */
  safeArea?:
    | number
    | {
        top?: number;
        right?: number;
        bottom?: number;
        left?: number;
      };

  /**
   * Render outline overlays via an OffscreenCanvas + Web Worker. Disable when
   * a strict Content-Security-Policy without `worker-src blob:` would
   * otherwise reject the blob worker — React Scan Pro automatically falls back
   * to main-thread rendering.
   *
   * @default true
   */
  useOffscreenCanvasWorker?: boolean;

  /**
   * Should react scan log internal errors to the console.
   *
   * Useful if react scan is not behaving expected and you want to provide information to maintainers when submitting an issue https://github.com/shuguang-lv/react-scan-pro/issues
   *
   *  @default false
   */
  _debug?: "verbose" | false;

  onCommitStart?: () => void;
  onRender?: (fiber: Fiber, renders: Array<Render>) => void;
  onCommitFinish?: () => void;
}

export interface ReactScanProGlobal {
  (options?: Options): ReturnType<typeof scan>;
  scan: typeof scan;
  setOptions: typeof setOptions;
  getOptions: typeof getOptions;
  onReport: typeof onReport;
  getLastReport: typeof getLastReport;
}

export interface StoreType {
  inspectState: Signal<States>;
  wasDetailsOpen: Signal<boolean>;
  lastReportTime: Signal<number>;
  isInIframe: Signal<boolean>;
  fiberRoots: WeakSet<Fiber>;
  reportData: Map<number, RenderData>;
  legacyReportData: Map<string, RenderData>;
  changesListeners: Map<number, Array<ChangesListener>>;
  interactionListeningForRenders: ((fiber: Fiber, renders: Array<Render>) => void) | null;
}

export type OutlineKey = `${string}-${string}`;

export interface Internals {
  instrumentation: ReturnType<typeof createInstrumentation> | null;
  componentAllowList: WeakMap<ComponentType<unknown>, Options> | null;
  options: Signal<Options>;
  onRender: ((fiber: Fiber, renders: Array<Render>) => void) | null;
  Store: StoreType;
  version: string;
  runInAllEnvironments: boolean;
}

export type FunctionalComponentStateChange = {
  type: ChangeReason.FunctionalState;
  value: unknown;
  prevValue?: unknown;
  count?: number | undefined;
  name: string;
};
export type ClassComponentStateChange = {
  type: ChangeReason.ClassState;
  value: unknown;
  prevValue?: unknown;
  count?: number | undefined;
  name: "state";
};

export type StateChange = FunctionalComponentStateChange | ClassComponentStateChange;
export type PropsChange = {
  type: ChangeReason.Props;
  name: string;
  value: unknown;
  prevValue?: unknown;
  count?: number | undefined;
};
export type ContextChange = {
  type: ChangeReason.Context;
  name: string;
  value: unknown;
  prevValue?: unknown;
  count?: number | undefined;
  contextType: number;
};

export type Change = StateChange | PropsChange | ContextChange;

export type ChangesPayload = {
  propsChanges: Array<PropsChange>;
  stateChanges: Array<FunctionalComponentStateChange | ClassComponentStateChange>;
  contextChanges: Array<ContextChange>;
};
export type ChangesListener = (changes: ChangesPayload) => void;

export const Store: StoreType = {
  wasDetailsOpen: signal(true),
  isInIframe: signal(IS_CLIENT && window.self !== window.top),
  inspectState: signal<States>({
    kind: "uninitialized",
  }),
  fiberRoots: new Set<Fiber>(),
  reportData: new Map<number, RenderData>(),
  legacyReportData: new Map<string, RenderData>(),
  lastReportTime: signal(0),
  interactionListeningForRenders: null,
  changesListeners: new Map(),
};

Store.inspectState.subscribe((state) => {
  if (state.kind !== "focused" && Store.reportData.size > 0) {
    Store.reportData.clear();
  }
});

export const ReactScanInternals: Internals = {
  instrumentation: null,
  componentAllowList: null,
  options: signal({
    enabled: true,
    log: false,
    showToolbar: true,
    animationSpeed: "fast",
    dangerouslyForceRunInProduction: false,
    showFPS: true,
    showNotificationCount: true,
    allowInIframe: false,
  }),
  runInAllEnvironments: false,
  onRender: null,
  Store,
  version: packageJson.version,
};

if (IS_CLIENT && (window.__REACT_SCAN_PRO_EXTENSION__ || window.__REACT_SCAN_EXTENSION__)) {
  window.__REACT_SCAN_PRO_VERSION__ = ReactScanInternals.version;
  window.__REACT_SCAN_VERSION__ = ReactScanInternals.version;
}

export type LocalStorageOptions = Omit<
  Options,
  "onCommitStart" | "onRender" | "onCommitFinish" | "report" | "scope"
>;

const applyLocalStorageOptions = (options: Options): LocalStorageOptions => {
  const {
    onCommitStart: _onCommitStart,
    onRender: _onRender,
    onCommitFinish: _onCommitFinish,
    report: _report,
    scope: _scope,
    ...rest
  } = options;
  return rest;
};

const validateOptions = (options: Partial<Options>): Partial<Options> => {
  const errors: Array<string> = [];
  const validOptions: Partial<Options> = {};

  for (const key in options) {
    const value = options[key as keyof Options];
    switch (key) {
      case "enabled":
      case "log":
      case "showToolbar":
      case "showNotificationCount":
      case "dangerouslyForceRunInProduction":
      case "showFPS":
      case "allowInIframe":
      case "useOffscreenCanvasWorker":
        if (typeof value !== "boolean") {
          errors.push(`- ${key} must be a boolean. Got "${value}"`);
        } else {
          validOptions[key] = value;
        }
        break;
      case "animationSpeed":
        if (!["slow", "fast", "off"].includes(value as string)) {
          errors.push(`- Invalid animation speed "${value}". Using default "fast"`);
        } else {
          validOptions[key] = value as "slow" | "fast" | "off";
        }
        break;
      case "safeArea": {
        const parsed = parseSafeAreaOption(value);
        if (parsed.ok) {
          validOptions.safeArea = parsed.value;
        } else {
          errors.push(parsed.error);
        }
        break;
      }
      case "scope":
        if (!value || (typeof value !== "object" && !Array.isArray(value))) {
          errors.push(`- ${key} must be a scan scope or an array of scan scopes.`);
        } else {
          validOptions.scope = value as ScanScope | Array<ScanScope>;
        }
        break;
      case "report":
        if (!value || typeof value !== "object") {
          errors.push(`- ${key} must be a report configuration object.`);
        } else {
          validOptions.report = value as ScanReportOptions;
        }
        break;
      case "onCommitStart":
        if (typeof value !== "function") {
          errors.push(`- ${key} must be a function. Got "${value}"`);
        } else {
          validOptions.onCommitStart = value as () => void;
        }
        break;
      case "onCommitFinish":
        if (typeof value !== "function") {
          errors.push(`- ${key} must be a function. Got "${value}"`);
        } else {
          validOptions.onCommitFinish = value as () => void;
        }
        break;
      case "onRender":
        if (typeof value !== "function") {
          errors.push(`- ${key} must be a function. Got "${value}"`);
        } else {
          validOptions.onRender = value as (fiber: Fiber, renders: Array<Render>) => void;
        }
        break;
      default:
        errors.push(`- Unknown option "${key}"`);
    }
  }

  if (errors.length > 0) {
    // oxlint-disable-next-line no-console
    console.warn(`${REACT_SCAN_PRO_LOG_PREFIX} Invalid options:\n${errors.join("\n")}`);
  }

  return validOptions;
};

export const getReport = (type?: ComponentType<unknown>) => {
  if (type) {
    for (const reportData of Array.from(Store.legacyReportData.values())) {
      if (reportData.type === type) {
        return reportData;
      }
    }
    return null;
  }
  return Store.legacyReportData;
};

export const setOptions = (userOptions: Partial<Options>) => {
  try {
    const validOptions = validateOptions(userOptions);

    if (Object.keys(validOptions).length === 0) {
      return;
    }

    const shouldInitToolbar =
      "showToolbar" in validOptions && validOptions.showToolbar !== undefined;

    const previousOptions = ReactScanInternals.options.value;
    const newOptions = {
      ...previousOptions,
      ...validOptions,
    };

    const { instrumentation } = ReactScanInternals;
    if (instrumentation && "enabled" in validOptions) {
      instrumentation.isPaused.value = validOptions.enabled === false;
    }

    ReactScanInternals.options.value = newOptions;
    syncReportSession(previousOptions, newOptions);

    saveLocalStorage<LocalStorageOptions>(STORAGE_KEY, applyLocalStorageOptions(newOptions));

    if (shouldInitToolbar) {
      initToolbar(!!newOptions.showToolbar);
    }

    return newOptions;
  } catch (e) {
    if (ReactScanInternals.options.value._debug === "verbose") {
      // oxlint-disable-next-line no-console
      console.error(
        REACT_SCAN_PRO_LOG_PREFIX,
        "Internal error: Failed to create notifications outline canvas",
        e,
      );
    }
    /** */
  }
};

export const getOptions = () => ReactScanInternals.options;

export const onReport = (listener: ScanReportListener) => {
  const unsubscribe = subscribeToReports(listener);
  ensureReportSession(ReactScanInternals.options.value);
  if (IS_CLIENT && !ReactScanInternals.instrumentation) start();
  return unsubscribe;
};

export const getLastReport = () => getStoredLastReport();

let isProduction: boolean | null = null;
let rdtHook: ReturnType<typeof getRDTHook>;
export const getIsProduction = () => {
  // Once we've definitively seen a non-production renderer, the app is "dev"
  // forever — cache that and short-circuit. We deliberately do NOT cache the
  // `true` result: tools like the Next.js dev overlay register a production
  // React renderer alongside the user's dev React, and the dev renderer may
  // arrive on a later tick. Caching `true` would lock out that flip.
  if (isProduction === false) {
    return false;
  }
  rdtHook ??= getRDTHook();
  const renderers = Array.from(rdtHook.renderers.values());
  if (renderers.length === 0) {
    return null;
  }
  for (const renderer of renderers) {
    const buildType = detectReactBuildType(renderer);
    if (buildType !== "production") {
      isProduction = false;
      return false;
    }
  }
  return true;
};

export const start = () => {
  try {
    if (!IS_CLIENT) {
      return;
    }

    if (
      !ReactScanInternals.runInAllEnvironments &&
      getIsProduction() &&
      !ReactScanInternals.options.value.dangerouslyForceRunInProduction
    ) {
      return;
    }

    checkReactGrabVersion();

    let localStorageOptions = readLocalStorage<LocalStorageOptions>(STORAGE_KEY);
    if (!localStorageOptions) {
      localStorageOptions = readLocalStorage<LocalStorageOptions>(LEGACY_STORAGE_KEY);
      if (localStorageOptions) saveLocalStorage(STORAGE_KEY, localStorageOptions);
    }

    if (localStorageOptions) {
      const validLocalOptions = validateOptions(localStorageOptions);

      if (Object.keys(validLocalOptions).length > 0) {
        ReactScanInternals.options.value = {
          ...ReactScanInternals.options.value,
          ...validLocalOptions,
        };
      }
    }

    const options = getOptions();

    initReactScanInstrumentation(() => {
      initToolbar(!!options.value.showToolbar);
    });

    if (IS_CLIENT) {
      setTimeout(() => {
        if (isInstrumentationActive()) return;
        // oxlint-disable-next-line no-console
        console.error(
          REACT_SCAN_PRO_LOG_PREFIX,
          "Failed to load. Must import React Scan Pro before React runs.",
        );
      }, 5000);
    }
  } catch (e) {
    if (ReactScanInternals.options.value._debug === "verbose") {
      // oxlint-disable-next-line no-console
      console.error(
        REACT_SCAN_PRO_LOG_PREFIX,
        "Internal error: Failed to create notifications outline canvas",
        e,
      );
    }
  }
};

const initToolbar = (showToolbar: boolean) => {
  window.reactScanCleanupListeners?.();

  const cleanupTimingTracking = startTimingTracking();
  const cleanupOutlineCanvas = createNotificationsOutlineCanvas();

  window.reactScanCleanupListeners = () => {
    cleanupTimingTracking();
    cleanupOutlineCanvas?.();
  };

  const windowToolbarContainer =
    window.__REACT_SCAN_PRO_TOOLBAR_CONTAINER__ ?? window.__REACT_SCAN_TOOLBAR_CONTAINER__;

  if (!showToolbar) {
    windowToolbarContainer?.remove();
    return;
  }

  windowToolbarContainer?.remove();
  const { shadowRoot } = initRootContainer();
  createToolbar(shadowRoot);
};

const createNotificationsOutlineCanvas = () => {
  try {
    const highlightRoot = document.documentElement;
    return createHighlightCanvas(highlightRoot);
  } catch (e) {
    if (ReactScanInternals.options.value._debug === "verbose") {
      // oxlint-disable-next-line no-console
      console.error(
        REACT_SCAN_PRO_LOG_PREFIX,
        "Internal error: Failed to create notifications outline canvas",
        e,
      );
    }
  }
};

export const scan = (options: Options = {}) => {
  setOptions(options);
  const isInIframe = Store.isInIframe.value;

  if (
    isInIframe &&
    !ReactScanInternals.options.value.allowInIframe &&
    !ReactScanInternals.runInAllEnvironments
  ) {
    return;
  }

  if (options.enabled === false && options.showToolbar !== true && !options.report) {
    return;
  }

  start();
};

export const useScan = (options: Options = {}) => {
  setOptions(options);
  start();
};

export const onRender = (
  type: unknown,
  _onRender: (fiber: Fiber, renders: Array<Render>) => void,
) => {
  const prevOnRender = ReactScanInternals.onRender;
  ReactScanInternals.onRender = (fiber, renders) => {
    prevOnRender?.(fiber, renders);
    if (getType(fiber.type) === type) {
      _onRender(fiber, renders);
    }
  };
};

export const ignoredProps = new WeakSet<
  Exclude<ReactNode, undefined | null | string | number | boolean | bigint>
>();

export const ignoreScan = (node: ReactNode) => {
  if (node && typeof node === "object") {
    ignoredProps.add(node);
  }
};
