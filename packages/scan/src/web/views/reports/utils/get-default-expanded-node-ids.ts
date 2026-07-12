import type { ComponentTreeNode } from "~core/reporting";
import { getCollapsedAncestorPath } from "./get-collapsed-ancestor-path";

export const getDefaultExpandedNodeIds = (roots: Array<ComponentTreeNode>) => {
  const expandedNodeIds = new Set<number>();
  const rootIds = new Set(roots.map((root) => root.fiberId));
  const pendingNodes = [...roots];

  while (pendingNodes.length > 0) {
    const node = pendingNodes.pop();
    if (!node) continue;
    if (node.didRender) {
      if (rootIds.has(node.fiberId)) expandedNodeIds.add(node.fiberId);
      pendingNodes.push(...node.children);
      continue;
    }

    const ancestorPath = getCollapsedAncestorPath(node);
    const pathEndNode = ancestorPath.at(-1) ?? node;
    if (pathEndNode.children.length > 0) expandedNodeIds.add(pathEndNode.fiberId);
    pendingNodes.push(...pathEndNode.children);
  }

  return expandedNodeIds;
};
