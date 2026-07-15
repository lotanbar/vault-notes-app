import { useState, FormEvent } from "react";
import { X, Check } from "lucide-react";

interface PasswordPromptProps {
  mode: "create" | "verify";
  title: string;
  error?: string | null;
  onSubmit: (password: string, keepUnlockedHours: number) => void;
  onCancel: () => void;
}

const DEFAULT_KEEP_UNLOCKED_HOURS = 8;

export function PasswordPrompt({ mode, title, error, onSubmit, onCancel }: PasswordPromptProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [stayUnlocked, setStayUnlocked] = useState(true);
  const [hours, setHours] = useState(DEFAULT_KEEP_UNLOCKED_HOURS);

  const mismatch = mode === "create" && confirm.length > 0 && password !== confirm;
  const canSubmit = mode === "create" ? password.length > 0 && password === confirm : password.length > 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(password, stayUnlocked ? hours : 0);
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
        <div className="duration-row">
          <label className="duration-checkbox">
            <input
              type="checkbox"
              checked={stayUnlocked}
              onChange={(e) => setStayUnlocked(e.currentTarget.checked)}
            />
            Keep unlocked for
          </label>
          {stayUnlocked && (
            <label className="duration-field">
              <input
                type="number"
                min={1}
                max={720}
                value={hours}
                onChange={(e) => setHours(Math.max(1, Number(e.currentTarget.value) || 1))}
              />
              hours
            </label>
          )}
        </div>
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
