import type { VaultFile } from "../types/vault";

interface Request {
  id: number;
  vault: VaultFile;
}

interface Response {
  id: number;
  json: string;
}

self.onmessage = (e: MessageEvent<Request>) => {
  const { id, vault } = e.data;
  const json = JSON.stringify(vault);
  const response: Response = { id, json };
  (self as unknown as Worker).postMessage(response);
};
