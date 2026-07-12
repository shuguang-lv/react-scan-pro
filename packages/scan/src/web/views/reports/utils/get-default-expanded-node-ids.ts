import type { ComponentTreeNode } from "~core/reporting";

export const getDefaultExpandedNodeIds = (roots: Array<ComponentTreeNode>) => {
  const expandedNodeIds = new Set<number>();
  const pendingNodes = [...roots];
  for (const root of roots) expandedNodeIds.add(root.fiberId);

  while (pendingNodes.length > 0) {
    const node = pendingNodes.pop();
    if (!node) continue;
    if (!node.didRender && node.children.length > 0) expandedNodeIds.add(node.fiberId);
    pendingNodes.push(...node.children);
  }

  return expandedNodeIds;
};
