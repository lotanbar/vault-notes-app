/** First occurrence of `query` in `text`, with `radius` chars of context on each side. */
export function buildSnippet(text: string, query: string, radius = 40): string | null {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end).trim() + suffix;
}
