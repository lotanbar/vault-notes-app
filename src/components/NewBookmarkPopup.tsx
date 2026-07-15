import { useState, FormEvent } from "react";
import { X, Check } from "lucide-react";

interface NewBookmarkPopupProps {
  defaultLabel: string;
  onSubmit: (label: string) => void;
  onCancel: () => void;
}

export function NewBookmarkPopup({ defaultLabel, onSubmit, onCancel }: NewBookmarkPopupProps) {
  const [label, setLabel] = useState(defaultLabel);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    onSubmit(label.trim());
  }

  return (
    <div className="modal-overlay">
      <form className="modal" onSubmit={handleSubmit}>
        <h2>New Bookmark</h2>
        <input
          autoFocus
          placeholder="Label"
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            <X size={18} />
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!label.trim()}>
            <Check size={18} />
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
