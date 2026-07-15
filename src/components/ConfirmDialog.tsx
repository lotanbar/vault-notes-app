import type { ReactNode } from "react";
import { X } from "lucide-react";

interface ConfirmAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  actions: ConfirmAction[];
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, actions, onCancel }: ConfirmDialogProps) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            <X size={18} />
            Cancel
          </button>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={action.variant === "danger" ? "danger" : ""}
              onClick={action.onClick}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
