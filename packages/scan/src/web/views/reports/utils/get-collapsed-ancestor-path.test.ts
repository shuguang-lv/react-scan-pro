import { describe, expect, it } from "vitest";
import type { ComponentTreeNode } from "~core/reporting";
import { getCollapsedAncestorPath } from "./get-collapsed-ancestor-path";
import { getDefaultExpandedNodeIds } from "./get-default-expanded-node-ids";

const createTreeNode = (
  fiberId: number,
  componentName: string,
  didRender: boolean,
  children: Array<ComponentTreeNode> = [],
): ComponentTreeNode => ({
  fiberId,
  parentFiberId: null,
  componentTypeId: componentName,
  componentName,
  didRender,
  renderCount: didRender ? 1 : 0,
  subtreeRenderCount: 1,
  mountCount: 0,
  updateCount: didRender ? 1 : 0,
  unmountCount: 0,
  totalSelfTime: didRender ? 1 : 0,
  maxSelfTime: didRender ? 1 : 0,
  totalTime: 1,
  children,
});

describe("getCollapsedAncestorPath", () => {
  it("collapses structural ancestors without absorbing a rendered child", () => {
    const renderedChild = createTreeNode(3, "RenderedChild", true);
    const innerAncestor = createTreeNode(2, "InnerAncestor", false, [renderedChild]);
    const outerAncestor = createTreeNode(1, "OuterAncestor", false, [innerAncestor]);

    expect(getCollapsedAncestorPath(outerAncestor)).toEqual([outerAncestor, innerAncestor]);
    expect(getDefaultExpandedNodeIds([outerAncestor])).toEqual(new Set([innerAncestor.fiberId]));
  });

  it("stops before an ancestor branch", () => {
    const firstChild = createTreeNode(2, "FirstChild", false);
    const secondChild = createTreeNode(3, "SecondChild", false);
    const root = createTreeNode(1, "Root", false, [firstChild, secondChild]);

    expect(getCollapsedAncestorPath(root)).toEqual([root]);
  });
});
