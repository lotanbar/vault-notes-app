import type { JSONContent } from "@tiptap/core";
import type { BookmarkIndex } from "../types/vault";

export interface BookmarkMarkInfo {
  bookmarkId: string;
  label: string;
}

export function extractBookmarks(doc: JSONContent): BookmarkMarkInfo[] {
  const found: BookmarkMarkInfo[] = [];
  function walk(node: JSONContent) {
    for (const mark of node.marks ?? []) {
      if (mark.type === "bookmark" && typeof mark.attrs?.bookmarkId === "string") {
        found.push({ bookmarkId: mark.attrs.bookmarkId, label: (mark.attrs.label as string) ?? "" });
      }
    }
    for (const child of node.content ?? []) walk(child);
  }
  walk(doc);
  return found;
}

export function extractBookmarkIds(doc: JSONContent): Set<string> {
  return new Set(extractBookmarks(doc).map((b) => b.bookmarkId));
}

/** Returns a new doc with every `link` mark's `broken` attr set from the current index. */
export function applyLinkValidity(doc: JSONContent, index: BookmarkIndex): JSONContent {
  function walk(node: JSONContent): JSONContent {
    const marks = node.marks?.map((mark) => {
      if (mark.type !== "link") return mark;
      const targetBookmarkId = mark.attrs?.targetBookmarkId as string | undefined;
      const broken = !targetBookmarkId || !index[targetBookmarkId];
      return { ...mark, attrs: { ...mark.attrs, broken } };
    });
    const content = node.content?.map(walk);
    return { ...node, ...(marks ? { marks } : {}), ...(content ? { content } : {}) };
  }
  return walk(doc);
}

/** Concatenated text currently covered by each bookmark mark, keyed by bookmarkId. */
export function getAllBookmarkTexts(doc: JSONContent): Map<string, string> {
  const map = new Map<string, string>();
  function walk(node: JSONContent) {
    if (node.text) {
      for (const mark of node.marks ?? []) {
        if (mark.type === "bookmark" && typeof mark.attrs?.bookmarkId === "string") {
          const id = mark.attrs.bookmarkId as string;
          map.set(id, (map.get(id) ?? "") + node.text);
        }
      }
    }
    for (const child of node.content ?? []) walk(child);
  }
  walk(doc);
  return map;
}

/** Text covered by each distinct `link` mark instance whose target is in `targetBookmarkIds`. */
export function getLinkTextsForTargets(doc: JSONContent, targetBookmarkIds: Set<string>): string[] {
  const byLinkId = new Map<string, string>();
  function walk(node: JSONContent) {
    if (node.text) {
      for (const mark of node.marks ?? []) {
        if (
          mark.type === "link" &&
          typeof mark.attrs?.targetBookmarkId === "string" &&
          targetBookmarkIds.has(mark.attrs.targetBookmarkId) &&
          typeof mark.attrs?.linkId === "string"
        ) {
          const linkId = mark.attrs.linkId as string;
          byLinkId.set(linkId, (byLinkId.get(linkId) ?? "") + node.text);
        }
      }
    }
    for (const child of node.content ?? []) walk(child);
  }
  walk(doc);
  return [...byLinkId.values()];
}

export function findEntangledBookmarks(
  index: BookmarkIndex,
  hostNodeIds: Set<string>,
): { bookmarkId: string; referrers: string[] }[] {
  return Object.entries(index)
    .filter(([, entry]) => hostNodeIds.has(entry.hostFileId) && entry.referrers.length > 0)
    .map(([bookmarkId, entry]) => ({ bookmarkId, referrers: entry.referrers }));
}
