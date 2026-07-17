export type NodeType = "file" | "folder";

// Points at a note's encrypted content blob inside the vault file's append-only
// blob region, instead of carrying the content inline. See src-tauri/src/vault.rs.
export interface ContentRef {
  payloadOffset: number;
  length: number;
}

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
  contentRef?: ContentRef;
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

// Pre-migration shape: content lived inline as a base64 ciphertext string
// directly on the tree node instead of as a separate blob reference.
export interface LegacyTreeNode extends Omit<TreeNode, "children" | "contentRef"> {
  children: LegacyTreeNode[];
  content?: string;
}

export interface LegacyVaultFile extends Omit<VaultFile, "tree"> {
  tree: LegacyTreeNode;
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data: string; // base64, no "data:mime;base64," prefix
}

export interface BookmarkRange {
  bookmarkId: string;
  label: string;
  from: number;
  to: number;
}

export interface LinkRange {
  linkId: string;
  targetBookmarkId: string;
  from: number;
  to: number;
}

export interface NodeContent {
  text: string;
  bookmarks: BookmarkRange[];
  links: LinkRange[];
  attachments: Attachment[];
}
