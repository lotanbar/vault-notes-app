import type { JSONContent } from "@tiptap/core";

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

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data: string; // base64, no "data:mime;base64," prefix
}

export interface NodeContent {
  doc: JSONContent;
  attachments: Attachment[];
}
