import type { BookmarkIndex, LinkRange, NodeContent } from "../types/vault";

export interface BookmarkMarkInfo {
  bookmarkId: string;
  label: string;
}

export function extractBookmarks(content: NodeContent): BookmarkMarkInfo[] {
  return content.bookmarks.map((b) => ({ bookmarkId: b.bookmarkId, label: b.label }));
}

export function isLinkBroken(link: LinkRange, index: BookmarkIndex): boolean {
  return !index[link.targetBookmarkId];
}

/** Current width (character length) of each bookmark's range, keyed by bookmarkId. */
export function bookmarkSpanLengths(content: NodeContent): Map<string, number> {
  return new Map(content.bookmarks.map((b) => [b.bookmarkId, b.to - b.from]));
}

/** Text currently covered by each distinct link whose target is in `targetBookmarkIds`. */
export function getLinkTextsForTargets(content: NodeContent, targetBookmarkIds: Set<string>): string[] {
  return content.links
    .filter((link) => targetBookmarkIds.has(link.targetBookmarkId))
    .map((link) => content.text.slice(link.from, link.to));
}

export function findEntangledBookmarks(
  index: BookmarkIndex,
  hostNodeIds: Set<string>,
): { bookmarkId: string; referrers: string[] }[] {
  return Object.entries(index)
    .filter(([, entry]) => hostNodeIds.has(entry.hostFileId) && entry.referrers.length > 0)
    .map(([bookmarkId, entry]) => ({ bookmarkId, referrers: entry.referrers }));
}
