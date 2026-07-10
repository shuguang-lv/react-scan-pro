import type * as reactScan from "react-scan-pro";

declare global {
  interface Window {
    __REACT_SCAN_PRO__?: {
      ReactScanInternals: {
        version: string;
        Store: {
          monitor: {
            value: boolean;
          };
        };
      };
    };
    __REACT_SCAN__?: {
      ReactScanInternals: {
        version: string;
        Store: {
          monitor: {
            value: boolean;
          };
        };
      };
    };
    __REACT_SCAN_PRO_EXTENSION__?: boolean;
    __REACT_SCAN_PRO_VERSION__?: string;
    __REACT_SCAN_EXTENSION__?: boolean;
    __REACT_SCAN_VERSION__?: string;
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: {
      checkDCE: (fn: unknown) => void;
      supportsFiber: boolean;
      supportsFlight: boolean;
      renderers: Map<number, ReactRenderer>;
      hasUnsupportedRendererAttached: boolean;
      onCommitFiberRoot: (rendererID: number, root: FiberRoot, priority: void | number) => void;
      onCommitFiberUnmount: (rendererID: number, fiber: Fiber) => void;
      onPostCommitFiberRoot: (rendererID: number, root: FiberRoot) => void;
      inject: (renderer: ReactRenderer) => number;
      _instrumentationSource?: string;
      _instrumentationIsActive?: boolean;
    };
    hideIntro: boolean;
    reactScan: reactScan.ReactScanProGlobal | undefined;
    reactScanPro: reactScan.ReactScanProGlobal | undefined;
  }
}
