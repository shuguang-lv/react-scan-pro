import { type Fiber, isHostFiber } from "bippy";

export const getNearestHostElements = (fiber: Fiber, maxElementCount: number) => {
  if (maxElementCount <= 0 || typeof Element === "undefined") return [];

  const elements: Array<Element> = [];
  const pendingFibers: Array<Fiber> = [];
  if (isHostFiber(fiber)) {
    if (fiber.stateNode instanceof Element) elements.push(fiber.stateNode);
  } else if (fiber.child) {
    pendingFibers.push(fiber.child);
  }

  while (pendingFibers.length > 0 && elements.length < maxElementCount) {
    const currentFiber = pendingFibers.pop();
    if (!currentFiber) continue;
    if (isHostFiber(currentFiber)) {
      if (currentFiber.stateNode instanceof Element) elements.push(currentFiber.stateNode);
    } else if (currentFiber.child) {
      pendingFibers.push(currentFiber.child);
    }
    if (currentFiber.sibling) pendingFibers.push(currentFiber.sibling);
  }

  return elements;
};
