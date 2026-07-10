import { type Fiber, getFiberId } from "bippy";
import { afterEach, describe, expect, it, vi } from "vitest";
import { beginScopeCommit, getScopeMatch } from "./scope";

const domFiberMocks = vi.hoisted(() => ({
  fibers: new WeakMap<object, unknown>(),
}));

vi.mock("bippy", async (importOriginal) => {
  const original = await importOriginal<typeof import("bippy")>();
  return {
    ...original,
    getFiberFromHostInstance: (element: object) =>
      domFiberMocks.fibers.get(element) ?? original.getFiberFromHostInstance(element as Element),
  };
});

const RootComponent = () => null;
const ChildComponent = () => null;

const createFiber = (type: () => null, parent: Fiber | null = null): Fiber =>
  ({
    type,
    memoizedProps: { role: "example" },
    return: parent,
    alternate: null,
  }) as unknown as Fiber;

describe("scan scope", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes descendants of a component-name root", () => {
    beginScopeCommit();
    const root = createFiber(RootComponent);
    const child = createFiber(ChildComponent, root);

    expect(getScopeMatch(child, { kind: "component-name", name: "RootComponent" }).isMatch).toBe(
      true,
    );
    beginScopeCommit();
    expect(getScopeMatch(child, { kind: "component-name", name: "MissingComponent" }).isMatch).toBe(
      false,
    );
  });

  it("supports predicate scopes and isolates predicate errors", () => {
    beginScopeCommit();
    const fiber = createFiber(ChildComponent);
    const matchingPredicate = vi.fn((candidate) => candidate.props !== null);

    expect(getScopeMatch(fiber, { kind: "predicate", match: matchingPredicate }).isMatch).toBe(
      true,
    );
    expect(matchingPredicate).toHaveBeenCalledOnce();

    beginScopeCommit();
    expect(
      getScopeMatch(fiber, {
        kind: "predicate",
        match: () => {
          throw new Error("scope failure");
        },
      }).isMatch,
    ).toBe(false);
  });

  it("matches fiber ids, multiple roots, and remounted component-name roots", () => {
    const firstRoot = createFiber(RootComponent);
    const secondRoot = createFiber(ChildComponent);
    const firstChild = createFiber(ChildComponent, firstRoot);
    const secondChild = createFiber(RootComponent, secondRoot);
    const scopes = [
      { kind: "fiber-id", id: getFiberId(firstRoot) } as const,
      { kind: "component-name", name: "ChildComponent" } as const,
    ];

    beginScopeCommit();
    expect(getScopeMatch(firstChild, scopes).isMatch).toBe(true);
    expect(getScopeMatch(secondChild, scopes).isMatch).toBe(true);

    beginScopeCommit();
    const remountedRoot = createFiber(RootComponent);
    const remountedChild = createFiber(ChildComponent, remountedRoot);
    expect(
      getScopeMatch(remountedChild, { kind: "component-name", name: "RootComponent" }).isMatch,
    ).toBe(true);
  });

  it("supports Element and CSS selector DOM roots", () => {
    const root = createFiber(RootComponent);
    const child = createFiber(ChildComponent, root);
    const element = {} as Element;
    domFiberMocks.fibers.set(element, root);
    vi.stubGlobal("document", {
      querySelectorAll: (selector: string) => (selector === "#scan-root" ? [element] : []),
    });

    beginScopeCommit();
    expect(getScopeMatch(child, { kind: "dom", target: element }).isMatch).toBe(true);
    beginScopeCommit();
    expect(getScopeMatch(child, { kind: "dom", target: "#scan-root" }).isMatch).toBe(true);
  });

  it("treats invalid selectors and missing roots as empty scopes", () => {
    vi.stubGlobal("document", {
      querySelectorAll: () => {
        throw new DOMException("Invalid selector");
      },
    });
    beginScopeCommit();
    expect(getScopeMatch(createFiber(ChildComponent), { kind: "dom", target: "[" }).isMatch).toBe(
      false,
    );
  });
});
