import { type Fiber, getDisplayName, isCompositeFiber } from "bippy";

const getOwnComponentName = (fiber: Fiber): string | null => {
  const componentNames = [getDisplayName(fiber.type), getDisplayName(fiber.elementType)];
  for (const componentName of componentNames) {
    if (componentName && componentName !== "Anonymous") return componentName;
  }

  for (const debugInfo of fiber._debugInfo ?? []) {
    if (debugInfo.name && debugInfo.name !== "Anonymous") return debugInfo.name;
  }

  return null;
};

const getNearestComponentName = (fiber: Fiber | null): string | null => {
  let currentFiber = fiber;
  while (currentFiber) {
    if (isCompositeFiber(currentFiber)) {
      const componentName = getOwnComponentName(currentFiber);
      if (componentName) return componentName;
    }
    currentFiber = currentFiber.return;
  }
  return null;
};

export const getComponentName = (fiber: Fiber): string => {
  const componentName = getOwnComponentName(fiber);
  if (componentName) return componentName;

  const ownerName =
    getNearestComponentName(fiber._debugOwner ?? null) ?? getNearestComponentName(fiber.return);
  return ownerName ? `Anonymous (${ownerName})` : "Anonymous";
};
