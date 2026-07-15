import { useEffect, useMemo, useState } from "react";
import { X, Check, Lock } from "lucide-react";
import { useVaultStore, type PickerEntry } from "../store/vaultStore";

interface BookmarkPickerPopupProps {
  onSubmit: (bookmarkId: string) => void;
  onCancel: () => void;
}

export function BookmarkPickerPopup({ onSubmit, onCancel }: BookmarkPickerPopupProps) {
  const listBookmarksForPicker = useVaultStore((s) => s.listBookmarksForPicker);
  const [entries, setEntries] = useState<PickerEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listBookmarksForPicker().then((result) => {
      if (!cancelled) setEntries(result);
    });
    return () => {
      cancelled = true;
    };
  }, [listBookmarksForPicker]);

  const grouped = useMemo(() => {
    if (!entries) return [];
    const q = query.trim().toLowerCase();
    const filtered = entries.filter((e) => {
      if (!q) return true;
      return e.hostFileName.toLowerCase().includes(q) || (e.label ?? "").toLowerCase().includes(q);
    });
    const byFile = new Map<string, { hostFileName: string; items: PickerEntry[] }>();
    for (const entry of filtered) {
      if (!byFile.has(entry.hostFileId)) {
        byFile.set(entry.hostFileId, { hostFileName: entry.hostFileName, items: [] });
      }
      byFile.get(entry.hostFileId)!.items.push(entry);
    }
    return [...byFile.values()];
  }, [entries, query]);

  function handleSubmit() {
    if (selected) onSubmit(selected);
  }

  return (
    <div className="modal-overlay">
      <div className="modal picker-modal">
        <h2>New Link</h2>
        <input
          autoFocus
          placeholder="Search bookmarks..."
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <div className="picker-list">
          {!entries ? (
            <p className="placeholder-text">Loading...</p>
          ) : grouped.length === 0 ? (
            <p className="placeholder-text">No bookmarks found.</p>
          ) : (
            grouped.map((group) => (
              <div key={group.hostFileName} className="picker-group">
                <div className="picker-group-title">{group.hostFileName}</div>
                {group.items.map((item) => (
                  <div
                    key={item.bookmarkId}
                    className={`picker-item${item.locked ? " disabled" : ""}${
                      selected === item.bookmarkId ? " selected" : ""
                    }`}
                    onClick={() => !item.locked && setSelected(item.bookmarkId)}
                  >
                    {item.locked ? (
                      <>
                        <Lock size={16} /> locked
                      </>
                    ) : (
                      item.label
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            <X size={18} />
            Cancel
          </button>
          <button type="button" className="primary" onClick={handleSubmit} disabled={!selected}>
            <Check size={18} />
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
