import { type Fiber, FunctionComponentTag, HostComponentTag } from "bippy";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getNearestHostElements } from "./get-nearest-host-elements";

class TestElement {
  isConnected = true;
}

const createFiber = (tag: number, stateNode: unknown = null): Fiber =>
  ({
    tag,
    stateNode,
    child: null,
    sibling: null,
    return: null,
  }) as Fiber;

describe("getNearestHostElements", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stops traversing after reaching the element limit", () => {
    vi.stubGlobal("Element", TestElement);
    const rootFiber = createFiber(FunctionComponentTag);
    const firstHostFiber = createFiber(HostComponentTag, new TestElement());
    const unvisitedHostFiber = createFiber(HostComponentTag);
    Object.defineProperty(unvisitedHostFiber, "stateNode", {
      get: () => {
        throw new Error("Element limit was not respected");
      },
    });
    rootFiber.child = firstHostFiber;
    firstHostFiber.sibling = unvisitedHostFiber;

    expect(getNearestHostElements(rootFiber, 1)).toEqual([firstHostFiber.stateNode]);
  });
});
