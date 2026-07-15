import { useEffect } from "react";
import { FolderPlus, FolderOpen, FileText } from "lucide-react";
import { useVaultStore } from "./store/vaultStore";
import { Sidebar } from "./components/Sidebar";
import { PasswordPrompt } from "./components/PasswordPrompt";
import { Editor } from "./components/Editor";
import { findNode } from "./lib/treeOps";
import type { TreeNode } from "./types/vault";
import "./App.css";

function App() {
  const vault = useVaultStore((s) => s.vault);
  const error = useVaultStore((s) => s.error);
  const pending = useVaultStore((s) => s.pending);
  const passwordError = useVaultStore((s) => s.passwordError);
  const newVault = useVaultStore((s) => s.newVault);
  const openVault = useVaultStore((s) => s.openVault);
  const tryAutoOpenLastVault = useVaultStore((s) => s.tryAutoOpenLastVault);
  const submitPassword = useVaultStore((s) => s.submitPassword);
  const cancelPassword = useVaultStore((s) => s.cancelPassword);
  const sessionUnlockedIds = useVaultStore((s) => s.sessionUnlockedIds);
  const activeFileId = useVaultStore((s) => s.activeFileId);
  const openFile = useVaultStore((s) => s.openFile);

  useEffect(() => {
    tryAutoOpenLastVault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeNode: TreeNode | null =
    vault && activeFileId ? findNode(vault.tree, activeFileId) : null;
  const activeFileOpenable =
    activeNode && activeNode.type === "file" && (!activeNode.locked || sessionUnlockedIds.has(activeNode.id));

  const passwordPromptProps = (() => {
    if (!pending) return null;
    switch (pending.kind) {
      case "vault-create":
        return { mode: "create" as const, title: "Set Master Password" };
      case "vault-open":
        return { mode: "verify" as const, title: "Enter Master Password" };
      case "node-lock":
        return { mode: "create" as const, title: "Set Lock Password" };
      case "node-unlock":
        return { mode: "verify" as const, title: "Enter Node Password" };
    }
  })();

  if (!vault) {
    return (
      <main className="container">
        <h1>Vault Notes</h1>
        <div className="row">
          <button className="primary" onClick={newVault}>
            <FolderPlus size={20} />
            New Vault
          </button>
          <button onClick={openVault}>
            <FolderOpen size={20} />
            Open Vault
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
        {passwordPromptProps && (
          <PasswordPrompt
            {...passwordPromptProps}
            error={passwordError}
            onSubmit={submitPassword}
            onCancel={cancelPassword}
          />
        )}
      </main>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar onOpenFile={openFile} />
      <main className="main-area">
        <div className="main-body">
          {error && <p className="error-text">{error}</p>}
          {activeFileOpenable && activeNode ? (
            <Editor key={activeNode.id} fileId={activeNode.id} fileName={activeNode.name} />
          ) : (
            <div className="empty-state">
              <FileText size={64} />
              <p>Pick a file to start editing</p>
            </div>
          )}
        </div>
      </main>
      {passwordPromptProps && (
        <PasswordPrompt
          {...passwordPromptProps}
          error={passwordError}
          onSubmit={submitPassword}
          onCancel={cancelPassword}
        />
      )}
    </div>
  );
}

export default App;
