import { type Fiber, getDisplayName, getFiberFromHostInstance, getFiberId } from "bippy";
import { REACT_SCAN_PRO_LOG_PREFIX } from "../logging-constants";

export interface ComponentNameScanScope {
  kind: "component-name";
  name: string;
}

export interface FiberIdScanScope {
  kind: "fiber-id";
  id: number;
}

export interface DomScanScope {
  kind: "dom";
  target: string | Element;
}

export interface ScanScopeCandidate {
  componentName: string | null;
  fiberId: number;
  props: unknown;
  fiber: Fiber;
}

export interface PredicateScanScope {
  kind: "predicate";
  match: (candidate: ScanScopeCandidate) => boolean;
}

export type ScanScope =
  | ComponentNameScanScope
  | FiberIdScanScope
  | DomScanScope
  | PredicateScanScope;

interface ScopeMatch {
  isMatch: boolean;
  rootFiberId: number | null;
}

let commitMatchCache = new WeakMap<Fiber, ScopeMatch>();
let domScopeFiberCache = new WeakMap<DomScanScope, Set<Fiber>>();
const warnedPredicates = new WeakSet<PredicateScanScope["match"]>();

export const beginScopeCommit = () => {
  commitMatchCache = new WeakMap<Fiber, ScopeMatch>();
  domScopeFiberCache = new WeakMap<DomScanScope, Set<Fiber>>();
};

const getScopes = (scope: ScanScope | Array<ScanScope> | undefined): Array<ScanScope> => {
  if (!scope) return [];
  return Array.isArray(scope) ? scope : [scope];
};

const getDomScopeFibers = (scope: DomScanScope): Array<Fiber> => {
  const cachedFibers = domScopeFiberCache.get(scope);
  if (cachedFibers) return Array.from(cachedFibers);
  if (typeof document === "undefined") return [];

  try {
    const elements =
      typeof scope.target === "string"
        ? Array.from(document.querySelectorAll(scope.target))
        : [scope.target];

    const fibers: Array<Fiber> = [];
    for (const element of elements) {
      const fiber = getFiberFromHostInstance(element);
      if (fiber) fibers.push(fiber);
    }
    domScopeFiberCache.set(scope, new Set(fibers));
    return fibers;
  } catch {
    domScopeFiberCache.set(scope, new Set<Fiber>());
    return [];
  }
};

const scopeMatchesFiber = (scope: ScanScope, fiber: Fiber): boolean => {
  switch (scope.kind) {
    case "component-name":
      return getDisplayName(fiber.type) === scope.name;
    case "fiber-id":
      return getFiberId(fiber) === scope.id;
    case "dom":
      return getDomScopeFibers(scope).some((scopeFiber) => scopeFiber === fiber);
    case "predicate":
      try {
        return scope.match({
          componentName: getDisplayName(fiber.type),
          fiberId: getFiberId(fiber),
          props: fiber.memoizedProps,
          fiber,
        });
      } catch (error) {
        if (!warnedPredicates.has(scope.match)) {
          warnedPredicates.add(scope.match);
          // oxlint-disable-next-line no-console
          console.warn(
            REACT_SCAN_PRO_LOG_PREFIX,
            "A scope predicate threw and was ignored.",
            error,
          );
        }
        return false;
      }
  }
};

export const getScopeMatch = (
  fiber: Fiber,
  scope: ScanScope | Array<ScanScope> | undefined,
): ScopeMatch => {
  const scopes = getScopes(scope);
  if (scopes.length === 0) {
    return { isMatch: true, rootFiberId: null };
  }

  const cachedMatch = commitMatchCache.get(fiber);
  if (cachedMatch) return cachedMatch;

  let currentFiber: Fiber | null = fiber;
  while (currentFiber) {
    for (const currentScope of scopes) {
      if (scopeMatchesFiber(currentScope, currentFiber)) {
        const match = {
          isMatch: true,
          rootFiberId: getFiberId(currentFiber),
        };
        commitMatchCache.set(fiber, match);
        return match;
      }
    }
    currentFiber = currentFiber.return;
  }

  const noMatch = { isMatch: false, rootFiberId: null };
  commitMatchCache.set(fiber, noMatch);
  return noMatch;
};
