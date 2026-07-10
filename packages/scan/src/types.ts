import type { Fiber, FiberRoot } from "bippy";

type ReactScanInternals = (typeof import("./core/index"))["ReactScanInternals"];
type Options = import("./core/index").Options;
type ReactScanProGlobal = import("./core/index").ReactScanProGlobal;

export interface ExtendedReactRenderer {
  findFiberByHostInstance: (instance: Element) => Fiber | null;
  version: string;
  bundleType: number;
  rendererPackageName: string;
  overrideHookState?: (fiber: Fiber, id: string, path: string[], value: unknown) => void;
  overrideProps?: (fiber: Fiber, path: string[], value: unknown) => void;
  overrideContext?: (fiber: Fiber, contextType: unknown, path: string[], value: unknown) => void;
}

declare global {
  var __REACT_SCAN__: {
    ReactScanInternals: ReactScanInternals;
  };
  var __REACT_SCAN_PRO__: {
    ReactScanInternals: ReactScanInternals;
  };
  var reactScanCleanupListeners: (() => void) | undefined;
  var reactScan: ReactScanProGlobal;
  var reactScanPro: ReactScanProGlobal;

  type TTimer = NodeJS.Timeout;

  interface RequestInit {
    priority?: "low" | "high" | "auto";
  }

  interface Window {
    reactScan: ReactScanProGlobal;
    reactScanPro: ReactScanProGlobal;
    __REACT_SCAN_PRO_OPTIONS__?: Options;
    __REACT_SCAN_PRO_TOOLBAR_CONTAINER__?: HTMLDivElement;
    __REACT_SCAN_PRO_VERSION__?: string;
    __REACT_SCAN_PRO_EXTENSION__?: boolean;
    __REACT_SCAN_TOOLBAR_CONTAINER__?: HTMLDivElement;
    __REACT_SCAN_VERSION__?: string;
    __REACT_SCAN_EXTENSION__?: boolean;
    __REACT_GRAB__?: unknown;
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: {
      checkDCE: (fn: unknown) => void;
      supportsFiber: boolean;
      supportsFlight: boolean;
      renderers: Map<number, ExtendedReactRenderer>;
      hasUnsupportedRendererAttached: boolean;
      onCommitFiberRoot: (rendererID: number, root: FiberRoot, priority: void | number) => void;
      onCommitFiberUnmount: (rendererID: number, fiber: Fiber) => void;
      onPostCommitFiberRoot: (rendererID: number, root: FiberRoot) => void;
      inject: (renderer: ExtendedReactRenderer) => number;
      _instrumentationSource?: string;
      _instrumentationIsActive?: boolean;
    };
  }
}
