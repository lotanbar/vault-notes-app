import type { VaultFile } from "../types/vault";

// The vault (including every note's encrypted content and any base64 attachments)
// is one JSON blob, and JSON.stringify-ing all of it on every autosave is CPU work
// that would otherwise block the UI thread — typing/scrolling would stall for as
// long as it takes. Doing it in a worker keeps that off the main thread.
let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, (json: string) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./vaultSerialize.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; json: string }>) => {
      const resolve = pending.get(e.data.id);
      if (!resolve) return;
      pending.delete(e.data.id);
      resolve(e.data.json);
    };
  }
  return worker;
}

export function serializeVault(vault: VaultFile): Promise<string> {
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    getWorker().postMessage({ id, vault });
  });
}
