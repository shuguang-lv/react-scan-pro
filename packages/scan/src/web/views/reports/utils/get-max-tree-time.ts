import type { ComponentTreeNode } from "~core/reporting";

export const getMaxTreeTime = (roots: Array<ComponentTreeNode>) => {
  let maxTime = 0;
  const pendingNodes = [...roots];
  while (pendingNodes.length > 0) {
    const node = pendingNodes.pop();
    if (!node) continue;
    maxTime = Math.max(maxTime, node.totalTime, node.totalSelfTime);
    pendingNodes.push(...node.children);
  }
  return maxTime;
};
