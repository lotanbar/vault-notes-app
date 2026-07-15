import type { TreeNode } from "../types/vault";

export function findNode(node: TreeNode, id: string): TreeNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function mapChildrenOf(node: TreeNode, id: string, fn: (children: TreeNode[]) => TreeNode[]): TreeNode {
  if (node.id === id) return { ...node, children: fn(node.children) };
  return { ...node, children: node.children.map((c) => mapChildrenOf(c, id, fn)) };
}

export function insertNode(root: TreeNode, parentId: string | null, index: number, node: TreeNode): TreeNode {
  const targetId = parentId ?? root.id;
  return mapChildrenOf(root, targetId, (children) => {
    const next = [...children];
    next.splice(index, 0, node);
    return next;
  });
}

export function removeNodes(root: TreeNode, ids: string[]): TreeNode {
  const idSet = new Set(ids);
  function strip(node: TreeNode): TreeNode {
    return { ...node, children: node.children.filter((c) => !idSet.has(c.id)).map(strip) };
  }
  return strip(root);
}

export function renameNode(root: TreeNode, id: string, name: string): TreeNode {
  function walk(node: TreeNode): TreeNode {
    if (node.id === id) return { ...node, name, modifiedAt: Date.now() };
    return { ...node, children: node.children.map(walk) };
  }
  return walk(root);
}

export function moveNodes(root: TreeNode, ids: string[], parentId: string | null, index: number): TreeNode {
  const nodes = ids.map((id) => findNode(root, id)).filter((n): n is TreeNode => n !== null);
  if (nodes.length === 0) return root;
  const stripped = removeNodes(root, ids);
  const targetId = parentId ?? stripped.id;
  return mapChildrenOf(stripped, targetId, (children) => {
    const next = [...children];
    next.splice(index, 0, ...nodes);
    return next;
  });
}

function findParentNode(root: TreeNode, id: string): TreeNode | null {
  for (const child of root.children) {
    if (child.id === id) return root;
    const found = findParentNode(child, id);
    if (found) return found;
  }
  return null;
}

/**
 * Where a new node should land given the current selection: inside a
 * selected folder, next to a selected file, or at the root when nothing
 * (or more than one thing) is selected.
 */
export function resolveInsertTarget(
  root: TreeNode,
  selectedIds: string[]
): { parentId: string | null; index: number } {
  if (selectedIds.length === 1) {
    const node = findNode(root, selectedIds[0]);
    if (node) {
      if (node.type === "folder") {
        return { parentId: node.id, index: node.children.length };
      }
      const parent = findParentNode(root, node.id);
      if (parent) {
        const idx = parent.children.findIndex((c) => c.id === node.id);
        return { parentId: parent.id === root.id ? null : parent.id, index: idx + 1 };
      }
    }
  }
  return { parentId: null, index: root.children.length };
}

export function uniqueSiblingName(base: string, siblings: TreeNode[]): string {
  const names = new Set(siblings.map((s) => s.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

export function collectDescendantIds(node: TreeNode): string[] {
  return [node.id, ...node.children.flatMap(collectDescendantIds)];
}

/** All nodes in the tree, excluding the synthetic root. */
export function flattenTree(root: TreeNode): TreeNode[] {
  return root.children.flatMap((c) => [c, ...flattenTree(c)]);
}
