import type { ComponentTreeNode } from "~core/reporting";

export const getCollapsedAncestorPath = (node: ComponentTreeNode) => {
  const ancestorPath = [node];
  let currentNode = node;

  while (!currentNode.didRender && currentNode.children.length === 1) {
    const childNode = currentNode.children[0];
    if (!childNode || childNode.didRender) break;
    ancestorPath.push(childNode);
    currentNode = childNode;
  }

  return ancestorPath;
};
