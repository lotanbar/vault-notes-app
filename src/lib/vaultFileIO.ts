import { invoke } from "@tauri-apps/api/core";
import type { ContentRef } from "../types/vault";

export type VaultOpenResult = { format: "v2"; header: string } | { format: "legacy"; contents: string };

// The v2 container format (src-tauri/src/vault.rs) is append-only: every write
// truncates off just the trailing 24-byte trailer and appends fresh bytes.
// Two writes racing on the same file would both compute the same "current end
// of file" and stomp on each other, so every call that touches the file on
// disk is funneled through one global queue to force them to run one at a time.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function openVaultFile(path: string): Promise<VaultOpenResult> {
  return enqueue(() => invoke<VaultOpenResult>("open_vault_file", { path }));
}

export function appendVaultBlob(path: string, dataB64: string): Promise<ContentRef> {
  return enqueue(() => invoke<ContentRef>("vault_append_blob", { path, dataB64 }));
}

export function writeVaultHeader(path: string, headerJson: string): Promise<void> {
  return enqueue(() => invoke<void>("vault_write_header", { path, headerJson }));
}

export function readVaultBlob(path: string, ref: ContentRef): Promise<string> {
  return enqueue(() =>
    invoke<string>("read_vault_blob", { path, payloadOffset: ref.payloadOffset, length: ref.length }),
  );
}

export function vaultCreateFresh(path: string): Promise<void> {
  return enqueue(() => invoke<void>("vault_create_fresh", { path }));
}

export function backupVaultFile(path: string, backupPath: string): Promise<void> {
  return enqueue(() => invoke<void>("backup_vault_file", { path, backupPath })).catch(() => {});
}

export function finalizeVaultWrite(tempPath: string, targetPath: string): Promise<void> {
  return enqueue(() => invoke<void>("finalize_vault_write", { tempPath, targetPath }));
}
