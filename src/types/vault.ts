export type NodeType = "file" | "folder";

export interface TreeNode {
  id: string;
  type: NodeType;
  name: string;
  createdAt: number;
  modifiedAt: number;
  children: TreeNode[];
  locked: boolean;
  lockSalt?: string;
  lockCheck?: string;
  content?: string;
}

export interface BookmarkIndexEntry {
  hostFileId: string;
  referrers: string[];
}

export type BookmarkIndex = Record<string, BookmarkIndexEntry>;

export interface VaultFile {
  version: number;
  salt: string;
  masterCheck: string;
  tree: TreeNode;
  index: BookmarkIndex;
}
