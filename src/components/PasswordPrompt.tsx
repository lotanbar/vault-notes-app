import { useState, FormEvent } from "react";
import { X, Check } from "lucide-react";

interface PasswordPromptProps {
  mode: "create" | "verify";
  title: string;
  error?: string | null;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function PasswordPrompt({ mode, title, error, onSubmit, onCancel }: PasswordPromptProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const mismatch = mode === "create" && confirm.length > 0 && password !== confirm;
  const canSubmit = mode === "create" ? password.length > 0 && password === confirm : password.length > 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(password);
  }

  return (
    <div className="modal-overlay">
      <form className="modal" onSubmit={handleSubmit}>
        <h2>{title}</h2>
        <input
          type="password"
          autoFocus
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
        />
        {mode === "create" && (
          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.currentTarget.value)}
          />
        )}
        {mismatch && <p className="modal-error">Passwords do not match.</p>}
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            <X size={18} />
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!canSubmit}>
            <Check size={18} />
            OK
          </button>
        </div>
      </form>
    </div>
  );
}
