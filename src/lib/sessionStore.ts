// Persists "stay unlocked" sessions across app restarts in localStorage, scoped by
// vault file path. Only the derived AES key material is stored (never the password),
// each entry carrying its own expiry so it self-invalidates after the chosen duration.

const LAST_VAULT_KEY = "vault-notes:lastVaultPath";

function vaultSessionKey(vaultPath: string): string {
  return `vault-notes:session:${vaultPath}`;
}

function nodeSessionsKey(vaultPath: string): string {
  return `vault-notes:nodeSessions:${vaultPath}`;
}

interface StoredSession {
  keyB64: string;
  expiresAt: number;
}

export function getLastVaultPath(): string | null {
  return localStorage.getItem(LAST_VAULT_KEY);
}

export function setLastVaultPath(path: string): void {
  localStorage.setItem(LAST_VAULT_KEY, path);
}

export function loadVaultSession(vaultPath: string): StoredSession | null {
  const raw = localStorage.getItem(vaultSessionKey(vaultPath));
  if (!raw) return null;
  try {
    const parsed: StoredSession = JSON.parse(raw);
    if (typeof parsed.keyB64 !== "string" || parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveVaultSession(vaultPath: string, keyB64: string, hours: number): void {
  if (hours <= 0) return;
  const expiresAt = Date.now() + hours * 60 * 60 * 1000;
  localStorage.setItem(vaultSessionKey(vaultPath), JSON.stringify({ keyB64, expiresAt }));
}

export function clearVaultSession(vaultPath: string): void {
  localStorage.removeItem(vaultSessionKey(vaultPath));
  localStorage.removeItem(nodeSessionsKey(vaultPath));
}

export function loadNodeSessions(vaultPath: string): Record<string, StoredSession> {
  const raw = localStorage.getItem(nodeSessionsKey(vaultPath));
  if (!raw) return {};
  try {
    const parsed: Record<string, StoredSession> = JSON.parse(raw);
    const now = Date.now();
    const valid: Record<string, StoredSession> = {};
    for (const [id, s] of Object.entries(parsed)) {
      if (s.expiresAt > now) valid[id] = s;
    }
    return valid;
  } catch {
    return {};
  }
}

export function saveNodeSession(vaultPath: string, nodeId: string, keyB64: string, hours: number): void {
  if (hours <= 0) return;
  const sessions = loadNodeSessions(vaultPath);
  sessions[nodeId] = { keyB64, expiresAt: Date.now() + hours * 60 * 60 * 1000 };
  localStorage.setItem(nodeSessionsKey(vaultPath), JSON.stringify(sessions));
}

export function clearNodeSession(vaultPath: string, nodeId: string): void {
  const sessions = loadNodeSessions(vaultPath);
  delete sessions[nodeId];
  localStorage.setItem(nodeSessionsKey(vaultPath), JSON.stringify(sessions));
}
