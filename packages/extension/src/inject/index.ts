import * as reactScan from "react-scan-pro";
import { gt } from "semver";
import type { IEvents } from "~types/messages";
import { EXTENSION_STORAGE_KEY, LEGACY_STORAGE_KEY, STORAGE_KEY } from "~utils/constants";
import {
  busDispatch,
  busSubscribe,
  canLoadReactScan,
  hasReactFiber,
  readLocalStorage,
  saveLocalStorage,
  sleep,
  storageGetItem,
  storageSetItem,
} from "~utils/helpers";
import { createNotificationUI, toggleNotification } from "./notification";

const reactScanExtensionVersion = reactScan.ReactScanInternals.version;
const reactScanProGlobal: reactScan.ReactScanProGlobal = Object.assign(reactScan.scan, {
  scan: reactScan.scan,
  setOptions: reactScan.setOptions,
  getOptions: reactScan.getOptions,
  onReport: reactScan.onReport,
  getLastReport: reactScan.getLastReport,
});
const exposeReactScanGlobal = () => {
  window.reactScanPro = reactScanProGlobal;
  window.reactScan = reactScanProGlobal;
};
const isTargetPageAlreadyUsedReactScan = () => {
  const currentReactScanVersion =
    window.__REACT_SCAN_PRO_VERSION__ ?? window.__REACT_SCAN_VERSION__;

  if (
    (window.__REACT_SCAN_PRO__ ?? window.__REACT_SCAN__)?.ReactScanInternals?.Store?.monitor
      ?.value &&
    !currentReactScanVersion
  ) {
    return true;
  }

  if (!reactScanExtensionVersion || !currentReactScanVersion) {
    return false;
  }

  return gt(currentReactScanVersion, reactScanExtensionVersion);
};

const getInitialOptions = async (): Promise<reactScan.Options> => {
  const storedOptions =
    readLocalStorage<reactScan.Options>(STORAGE_KEY) ??
    readLocalStorage<reactScan.Options>(LEGACY_STORAGE_KEY);
  let isEnabled = false;

  try {
    const storedEnabled = await storageGetItem<boolean>(EXTENSION_STORAGE_KEY, "isEnabled");
    isEnabled = storedEnabled ?? false;
  } catch {}

  return {
    ...storedOptions,
    enabled: isEnabled,
    showToolbar: isEnabled,
    dangerouslyForceRunInProduction: true,
  };
};

const initializeReactScan = async () => {
  const options = await getInitialOptions();

  window.__REACT_SCAN_PRO_EXTENSION__ = true;
  window.__REACT_SCAN_EXTENSION__ = true;
  if (options.enabled) {
    window.hideIntro = true;
    reactScan.scan(options);
    exposeReactScanGlobal();
  }
};

const updateReactScanState = async (isEnabled: boolean | null) => {
  const toggledState = isEnabled === null ? true : !isEnabled;

  try {
    await storageSetItem(EXTENSION_STORAGE_KEY, "isEnabled", toggledState);
  } catch {}

  const storedOptions =
    readLocalStorage<reactScan.Options>(STORAGE_KEY) ??
    readLocalStorage<reactScan.Options>(LEGACY_STORAGE_KEY) ??
    {};
  const updatedOptions = {
    ...storedOptions,
    enabled: toggledState,
    showToolbar: toggledState,
    dangerouslyForceRunInProduction: true,
  };

  saveLocalStorage(STORAGE_KEY, updatedOptions);

  window.location.reload();
};

void initializeReactScan();

window.addEventListener("DOMContentLoaded", async () => {
  if (!canLoadReactScan) {
    return;
  }

  let isReactAvailable = false;

  await sleep(1000);
  isReactAvailable = await hasReactFiber();

  if (!isReactAvailable) {
    createNotificationUI({
      title: "React Not Detected",
      content:
        "React is not detected on this page.\nPlease ensure you're visiting a React application.",
    });

    busDispatch<IEvents["react-scan-pro:send-to-background"]>("react-scan-pro:send-to-background", {
      topic: "react-scan-pro:send-to-background",
      message: {
        type: "react-scan-pro:is-enabled",
        data: {
          state: false,
        },
      },
    });

    busSubscribe<IEvents["react-scan-pro:toggle-state"]>(
      "react-scan-pro:toggle-state",
      async () => {
        toggleNotification();
      },
    );

    return;
  }

  if (isTargetPageAlreadyUsedReactScan()) {
    createNotificationUI({
      title: "Already Initialized",
      content: "React Scan Pro is already initialized on this page.",
    });

    busDispatch<IEvents["react-scan-pro:send-to-background"]>("react-scan-pro:send-to-background", {
      topic: "react-scan-pro:send-to-background",
      message: {
        type: "react-scan-pro:is-enabled",
        data: {
          state: false,
        },
      },
    });

    busSubscribe<IEvents["react-scan-pro:toggle-state"]>(
      "react-scan-pro:toggle-state",
      async () => {
        toggleNotification();
      },
    );

    return;
  }

  const storedOptions = readLocalStorage<reactScan.Options>(STORAGE_KEY);
  if (storedOptions !== null) {
    busDispatch<IEvents["react-scan-pro:send-to-background"]>("react-scan-pro:send-to-background", {
      topic: "react-scan-pro:send-to-background",
      message: {
        type: "react-scan-pro:is-enabled",
        data: {
          state: storedOptions.showToolbar,
        },
      },
    });
  }

  if (!isTargetPageAlreadyUsedReactScan()) {
    exposeReactScanGlobal();
  }

  busSubscribe<IEvents["react-scan-pro:toggle-state"]>("react-scan-pro:toggle-state", async () => {
    if (!isReactAvailable || isTargetPageAlreadyUsedReactScan()) {
      toggleNotification();
      return;
    }

    try {
      const isEnabled = await storageGetItem<boolean>(EXTENSION_STORAGE_KEY, "isEnabled");
      await updateReactScanState(!!isEnabled);
    } catch {
      await updateReactScanState(null);
    }
  });
});
