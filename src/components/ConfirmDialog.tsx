import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
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
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter") {
      e.preventDefault();
      actions[actions.length - 1]?.onClick();
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" ref={modalRef} tabIndex={-1} onKeyDown={handleKeyDown}>
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            <X size={15} />
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
