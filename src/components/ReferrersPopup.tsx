import { useEffect, useState } from "react";
import { X, Lock } from "lucide-react";
import { useVaultStore, type ReferrerEntry } from "../store/vaultStore";
import { findNode } from "../lib/treeOps";

interface ReferrersPopupProps {
  bookmarkIds: string[];
  onClose: () => void;
}

export function ReferrersPopup({ bookmarkIds, onClose }: ReferrersPopupProps) {
  const getReferrerEntries = useVaultStore((s) => s.getReferrerEntries);
  const openFile = useVaultStore((s) => s.openFile);
  const vault = useVaultStore((s) => s.vault);
  const [entries, setEntries] = useState<ReferrerEntry[] | null>(null);

  const key = bookmarkIds.join(",");
  useEffect(() => {
    let cancelled = false;
    getReferrerEntries(bookmarkIds).then((result) => {
      if (!cancelled) setEntries(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function handleOpen(entry: ReferrerEntry) {
    if (entry.locked || !vault) return;
    const node = findNode(vault.tree, entry.fileId);
    if (!node) return;
    openFile(node);
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal picker-modal">
        <h2>Who links here</h2>
        {!entries ? (
          <p className="placeholder-text">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="placeholder-text">No other files link to this bookmark.</p>
        ) : (
          <div className="picker-list">
            {entries.map((entry) => (
              <div key={entry.fileId} className="picker-group">
                <div
                  className={`picker-group-title${entry.locked ? "" : " clickable"}`}
                  onClick={() => handleOpen(entry)}
                >
                  {entry.locked ? (
                    <>
                      <Lock size={16} /> {entry.fileName} (locked)
                    </>
                  ) : (
                    entry.fileName
                  )}
                </div>
                {!entry.locked &&
                  entry.snippets.map((snippet, i) => (
                    <div key={i} className="picker-snippet">
                      "{snippet}"
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            <X size={18} />
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
