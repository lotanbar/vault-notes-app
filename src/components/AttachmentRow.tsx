import { Paperclip, Save, Trash2 } from "lucide-react";
import type { Attachment } from "../types/vault";
import { formatFileSize } from "../lib/attachmentOps";

interface AttachmentRowProps {
  attachments: Attachment[];
  onOpen: (attachment: Attachment) => void;
  onRequestDelete: (attachment: Attachment) => void;
  onSaveAs: (attachment: Attachment) => void;
}

export function AttachmentRow({ attachments, onOpen, onRequestDelete, onSaveAs }: AttachmentRowProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="attachment-row">
      {attachments.map((a) => (
        <div key={a.id} className="attachment-chip" onClick={() => onOpen(a)} title={a.name}>
          <Paperclip size={13} className="attachment-chip-icon" />
          <div className="attachment-chip-info">
            <span className="attachment-chip-name">{a.name}</span>
            <span className="attachment-chip-size">{formatFileSize(a.size)}</span>
          </div>
          <button
            type="button"
            className="icon-btn attachment-chip-action"
            title="Save As..."
            onClick={(e) => {
              e.stopPropagation();
              onSaveAs(a);
            }}
          >
            <Save size={20} />
          </button>
          <button
            type="button"
            className="icon-btn attachment-chip-action"
            title="Delete attachment"
            onClick={(e) => {
              e.stopPropagation();
              onRequestDelete(a);
            }}
          >
            <Trash2 size={20} />
          </button>
        </div>
      ))}
    </div>
  );
}
