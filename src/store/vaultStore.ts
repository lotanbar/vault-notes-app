import { create } from "zustand";
import Fuse from "fuse.js";
import type { JSONContent } from "@tiptap/core";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import type { VaultFile, TreeNode, NodeType, BookmarkIndex } from "../types/vault";
import { deriveKey, encryptToB64, decryptFromB64, randomSaltB64, exportKeyB64, importKeyB64 } from "../crypto/crypto";
import {
  insertNode,
  removeNodes,
  renameNode as renameNodeInTree,
  moveNodes as moveNodesInTree,
  uniqueSiblingName,
  findNode,
  collectDescendantIds,
  flattenTree,
} from "../lib/treeOps";
import { extractBookmarks, getLinkTextsForTargets } from "../lib/bookmarkOps";
import { extractPlainText, buildSnippet } from "../lib/searchOps";
import {
  getLastVaultPath,
  setLastVaultPath,
  loadVaultSession,
  saveVaultSession,
  clearVaultSession,
  loadNodeSessions,
  saveNodeSession,
  clearNodeSession,
} from "../lib/sessionStore";

const MASTER_CHECK_SENTINEL = "vault-notes-master-check-v1";
const LOCK_CHECK_SENTINEL = "vault-notes-lock-check-v1";

type PendingAction =
  | { kind: "vault-create"; path: string }
  | { kind: "vault-open"; path: string; raw: VaultFile }
  | { kind: "node-lock"; id: string }
  | { kind: "node-unlock"; id: string };

function newRootNode(): TreeNode {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    type: "folder",
    name: "root",
    createdAt: now,
    modifiedAt: now,
    children: [],
    locked: false,
  };
}

function buildNode(type: NodeType, name: string): TreeNode {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    type,
    name,
    createdAt: now,
    modifiedAt: now,
    children: [],
    locked: false,
  };
}

export interface NavPosition {
  fileId: string;
  bookmarkId: string | null;
}

export interface PickerEntry {
  bookmarkId: string;
  label: string | null;
  hostFileId: string;
  hostFileName: string;
  locked: boolean;
}

export interface ReferrerEntry {
  fileId: string;
  fileName: string;
  locked: boolean;
  snippets: string[];
}

export interface SearchResult {
  fileId: string;
  fileName: string;
  type: NodeType;
  snippet: string | null;
}

interface VaultState {
  filePath: string | null;
  vault: VaultFile | null;
  masterKey: CryptoKey | null;
  dirty: boolean;
  error: string | null;

  pending: PendingAction | null;
  passwordError: string | null;

  sessionUnlockedIds: Set<string>;
  nodeKeys: Map<string, CryptoKey>;

  selectedIds: string[];

  activeFileId: string | null;
  activeBookmarkId: string | null;
  navBack: NavPosition[];
  navForward: NavPosition[];

  newVault: () => Promise<void>;
  openVault: () => Promise<void>;
  tryAutoOpenLastVault: () => Promise<void>;
  submitPassword: (password: string, keepUnlockedHours: number) => Promise<void>;
  cancelPassword: () => void;
  saveVault: () => Promise<void>;
  saveVaultAs: () => Promise<void>;
  lockVault: () => void;

  setSelection: (ids: string[]) => void;
  createNode: (type: NodeType, parentId: string | null, index: number) => TreeNode | null;
  renameNodeAction: (id: string, name: string) => void;
  moveNodesAction: (ids: string[], parentId: string | null, index: number) => void;
  deleteNodesAction: (ids: string[]) => void;

  toggleNodeLock: (id: string) => void;

  loadNodeContent: (id: string) => Promise<JSONContent | null>;
  saveNodeContent: (id: string, doc: JSONContent) => Promise<void>;

  openFile: (node: TreeNode) => void;
  navigateToBookmark: (targetBookmarkId: string) => void;
  goBack: () => void;
  goForward: () => void;

  addBookmarkToIndex: (bookmarkId: string, hostFileId: string) => void;
  removeBookmarkFromIndex: (bookmarkId: string) => void;
  addReferrerToIndex: (targetBookmarkId: string, referrerFileId: string) => void;
  removeReferrerFromIndex: (targetBookmarkId: string, referrerFileId: string) => void;
  listBookmarksForPicker: () => Promise<PickerEntry[]>;
  getReferrerEntries: (bookmarkIds: string[]) => Promise<ReferrerEntry[]>;

  searchVault: (query: string) => Promise<SearchResult[]>;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  filePath: null,
  vault: null,
  masterKey: null,
  dirty: false,
  error: null,

  pending: null,
  passwordError: null,

  sessionUnlockedIds: new Set(),
  nodeKeys: new Map(),

  selectedIds: [],

  activeFileId: null,
  activeBookmarkId: null,
  navBack: [],
  navForward: [],

  newVault: async () => {
    const path = await save({
      filters: [{ name: "Vault", extensions: ["vlt"] }],
      defaultPath: "untitled.vlt",
    });
    if (!path) return;
    set({ pending: { kind: "vault-create", path }, passwordError: null });
  },

  openVault: async () => {
    const { filePath: currentPath, vault: currentVault, dirty } = get();
    if (currentPath && currentVault && dirty) {
      invoke("write_vault_file", {
        path: currentPath,
        contents: JSON.stringify(currentVault, null, 2),
      }).catch(() => {});
    }
    const path = await open({
      multiple: false,
      filters: [{ name: "Vault", extensions: ["vlt"] }],
    });
    if (!path || Array.isArray(path)) return;
    try {
      const json = await invoke<string>("read_vault_file", { path });
      const raw: VaultFile = JSON.parse(json);
      set({ pending: { kind: "vault-open", path, raw }, passwordError: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  tryAutoOpenLastVault: async () => {
    if (get().vault) return;
    const path = getLastVaultPath();
    if (!path) return;
    try {
      const json = await invoke<string>("read_vault_file", { path });
      const raw: VaultFile = JSON.parse(json);

      const session = loadVaultSession(path);
      if (session) {
        try {
          const key = await importKeyB64(session.keyB64);
          const decrypted = await decryptFromB64(key, raw.masterCheck);
          if (decrypted === MASTER_CHECK_SENTINEL) {
            const nodeSessions = loadNodeSessions(path);
            const nodeKeys = new Map<string, CryptoKey>();
            const sessionUnlockedIds = new Set<string>();
            for (const [nodeId, s] of Object.entries(nodeSessions)) {
              try {
                nodeKeys.set(nodeId, await importKeyB64(s.keyB64));
                sessionUnlockedIds.add(nodeId);
              } catch {
                // corrupt entry, skip
              }
            }
            set({
              filePath: path,
              vault: raw,
              masterKey: key,
              dirty: false,
              error: null,
              pending: null,
              passwordError: null,
              sessionUnlockedIds,
              nodeKeys,
              selectedIds: [],
              activeFileId: null,
              activeBookmarkId: null,
              navBack: [],
              navForward: [],
            });
            return;
          }
        } catch {
          // cached key no longer works (file replaced, corrupt entry, etc.) — fall through
        }
      }

      set({ pending: { kind: "vault-open", path, raw }, passwordError: null });
    } catch {
      // last vault file missing or unreadable — silently fall back to the landing screen
    }
  },

  submitPassword: async (password, keepUnlockedHours) => {
    const { pending, vault } = get();
    if (!pending) return;

    if (pending.kind === "vault-create") {
      try {
        const salt = randomSaltB64();
        const key = await deriveKey(password, salt);
        const masterCheck = await encryptToB64(key, MASTER_CHECK_SENTINEL);
        const newVaultFile: VaultFile = {
          version: 1,
          salt,
          masterCheck,
          tree: newRootNode(),
          index: {},
        };
        await invoke("write_vault_file", {
          path: pending.path,
          contents: JSON.stringify(newVaultFile, null, 2),
        });
        setLastVaultPath(pending.path);
        saveVaultSession(pending.path, await exportKeyB64(key), keepUnlockedHours);
        set({
          filePath: pending.path,
          vault: newVaultFile,
          masterKey: key,
          dirty: false,
          error: null,
          pending: null,
          passwordError: null,
          sessionUnlockedIds: new Set(),
          nodeKeys: new Map(),
          selectedIds: [],
          activeFileId: null,
          activeBookmarkId: null,
          navBack: [],
          navForward: [],
        });
      } catch (e) {
        set({ error: String(e), pending: null });
      }
      return;
    }

    if (pending.kind === "vault-open") {
      try {
        const key = await deriveKey(password, pending.raw.salt);
        const decrypted = await decryptFromB64(key, pending.raw.masterCheck);
        if (decrypted !== MASTER_CHECK_SENTINEL) throw new Error("mismatch");
        setLastVaultPath(pending.path);
        saveVaultSession(pending.path, await exportKeyB64(key), keepUnlockedHours);

        // Restore any locked-node sessions still within their own unlock window.
        const nodeSessions = loadNodeSessions(pending.path);
        const nodeKeys = new Map<string, CryptoKey>();
        const sessionUnlockedIds = new Set<string>();
        for (const [nodeId, s] of Object.entries(nodeSessions)) {
          try {
            nodeKeys.set(nodeId, await importKeyB64(s.keyB64));
            sessionUnlockedIds.add(nodeId);
          } catch {
            // corrupt entry, skip
          }
        }

        set({
          filePath: pending.path,
          vault: pending.raw,
          masterKey: key,
          dirty: false,
          error: null,
          pending: null,
          passwordError: null,
          sessionUnlockedIds,
          nodeKeys,
          selectedIds: [],
          activeFileId: null,
          activeBookmarkId: null,
          navBack: [],
          navForward: [],
        });
      } catch {
        set({ passwordError: "Incorrect password." });
      }
      return;
    }

    if (pending.kind === "node-lock") {
      if (!vault) return;
      const node = findNode(vault.tree, pending.id);
      if (!node) return;
      const lockSalt = randomSaltB64();
      const key = await deriveKey(password, lockSalt);
      const lockCheck = await encryptToB64(key, LOCK_CHECK_SENTINEL);
      const updatedTree = applyToNode(vault.tree, pending.id, (n) => ({
        ...n,
        locked: true,
        lockSalt,
        lockCheck,
      }));
      const nodeKeys = new Map(get().nodeKeys);
      nodeKeys.set(pending.id, key);
      const sessionUnlockedIds = new Set(get().sessionUnlockedIds);
      sessionUnlockedIds.add(pending.id);
      const { filePath } = get();
      if (filePath) saveNodeSession(filePath, pending.id, await exportKeyB64(key), keepUnlockedHours);
      set({
        vault: { ...vault, tree: updatedTree },
        dirty: true,
        nodeKeys,
        sessionUnlockedIds,
        pending: null,
        passwordError: null,
      });
      return;
    }

    if (pending.kind === "node-unlock") {
      if (!vault) return;
      const node = findNode(vault.tree, pending.id);
      if (!node || !node.lockSalt || !node.lockCheck) return;
      try {
        const key = await deriveKey(password, node.lockSalt);
        const decrypted = await decryptFromB64(key, node.lockCheck);
        if (decrypted !== LOCK_CHECK_SENTINEL) throw new Error("mismatch");
        const nodeKeys = new Map(get().nodeKeys);
        nodeKeys.set(pending.id, key);
        const sessionUnlockedIds = new Set(get().sessionUnlockedIds);
        sessionUnlockedIds.add(pending.id);
        const { filePath } = get();
        if (filePath) saveNodeSession(filePath, pending.id, await exportKeyB64(key), keepUnlockedHours);
        set({ nodeKeys, sessionUnlockedIds, pending: null, passwordError: null });
      } catch {
        set({ passwordError: "Incorrect password." });
      }
      return;
    }
  },

  cancelPassword: () => set({ pending: null, passwordError: null }),

  saveVault: async () => {
    const { filePath, vault } = get();
    if (!filePath || !vault) return;
    try {
      await invoke("write_vault_file", { path: filePath, contents: JSON.stringify(vault, null, 2) });
      set({ dirty: false, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  saveVaultAs: async () => {
    const { vault } = get();
    if (!vault) return;
    const path = await save({
      filters: [{ name: "Vault", extensions: ["vlt"] }],
      defaultPath: "untitled.vlt",
    });
    if (!path) return;
    try {
      await invoke("write_vault_file", { path, contents: JSON.stringify(vault, null, 2) });
      set({ filePath: path, dirty: false, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  lockVault: () => {
    const { filePath, vault, dirty } = get();
    if (!filePath || !vault) return;
    if (dirty) {
      invoke("write_vault_file", { path: filePath, contents: JSON.stringify(vault, null, 2) }).catch(() => {});
    }
    clearVaultSession(filePath);
    set({
      vault: null,
      masterKey: null,
      dirty: false,
      sessionUnlockedIds: new Set(),
      nodeKeys: new Map(),
      selectedIds: [],
      activeFileId: null,
      activeBookmarkId: null,
      navBack: [],
      navForward: [],
      pending: { kind: "vault-open", path: filePath, raw: vault },
      passwordError: null,
    });
  },

  setSelection: (ids) => set({ selectedIds: ids }),

  createNode: (type, parentId, index) => {
    const { vault } = get();
    if (!vault) return null;
    const parent = parentId ? findNode(vault.tree, parentId) : vault.tree;
    if (!parent) return null;
    const baseName = type === "folder" ? "New Folder" : "New File";
    const name = uniqueSiblingName(baseName, parent.children);
    const node = buildNode(type, name);
    const nextTree = insertNode(vault.tree, parentId, index, node);
    set({ vault: { ...vault, tree: nextTree }, dirty: true });
    return node;
  },

  renameNodeAction: (id, name) => {
    const { vault } = get();
    if (!vault || !name.trim()) return;
    const nextTree = renameNodeInTree(vault.tree, id, name.trim());
    set({ vault: { ...vault, tree: nextTree }, dirty: true });
  },

  moveNodesAction: (ids, parentId, index) => {
    const { vault } = get();
    if (!vault) return;
    const nextTree = moveNodesInTree(vault.tree, ids, parentId, index);
    set({ vault: { ...vault, tree: nextTree }, dirty: true });
  },

  deleteNodesAction: (ids) => {
    const { vault, sessionUnlockedIds, nodeKeys, activeFileId } = get();
    if (!vault) return;
    const deletedIds = new Set(
      ids.flatMap((id) => {
        const node = findNode(vault.tree, id);
        return node ? collectDescendantIds(node) : [id];
      }),
    );

    // Case 1: strip bookmarks hosted by any deleted node.
    // Case 2: strip deleted node ids from other bookmarks' referrer lists.
    const nextIndex: BookmarkIndex = {};
    for (const [bookmarkId, entry] of Object.entries(vault.index)) {
      if (deletedIds.has(entry.hostFileId)) continue;
      nextIndex[bookmarkId] = {
        ...entry,
        referrers: entry.referrers.filter((rid) => !deletedIds.has(rid)),
      };
    }

    const nextTree = removeNodes(vault.tree, ids);
    const nextSessionUnlocked = new Set(sessionUnlockedIds);
    const nextNodeKeys = new Map(nodeKeys);
    const { filePath } = get();
    for (const id of deletedIds) {
      nextSessionUnlocked.delete(id);
      nextNodeKeys.delete(id);
      if (filePath) clearNodeSession(filePath, id);
    }
    set({
      vault: { ...vault, tree: nextTree, index: nextIndex },
      dirty: true,
      sessionUnlockedIds: nextSessionUnlocked,
      nodeKeys: nextNodeKeys,
      selectedIds: [],
      activeFileId: activeFileId && deletedIds.has(activeFileId) ? null : activeFileId,
      activeBookmarkId: activeFileId && deletedIds.has(activeFileId) ? null : get().activeBookmarkId,
    });
  },

  toggleNodeLock: (id) => {
    const { vault, sessionUnlockedIds } = get();
    if (!vault) return;
    const node = findNode(vault.tree, id);
    if (!node) return;

    if (!node.locked) {
      set({ pending: { kind: "node-lock", id }, passwordError: null });
      return;
    }

    if (sessionUnlockedIds.has(id)) {
      const nextSessionUnlocked = new Set(sessionUnlockedIds);
      nextSessionUnlocked.delete(id);
      const nextNodeKeys = new Map(get().nodeKeys);
      nextNodeKeys.delete(id);
      const { filePath } = get();
      if (filePath) clearNodeSession(filePath, id);
      set({ sessionUnlockedIds: nextSessionUnlocked, nodeKeys: nextNodeKeys });
      return;
    }

    set({ pending: { kind: "node-unlock", id }, passwordError: null });
  },

  loadNodeContent: async (id) => {
    const { vault, masterKey, nodeKeys } = get();
    if (!vault || !masterKey) return null;
    const node = findNode(vault.tree, id);
    if (!node || !node.content) return null;
    let payload = node.content;
    if (node.locked) {
      const nodeKey = nodeKeys.get(id);
      if (!nodeKey) return null;
      payload = await decryptFromB64(nodeKey, payload);
    }
    const plaintext = await decryptFromB64(masterKey, payload);
    return JSON.parse(plaintext) as JSONContent;
  },

  saveNodeContent: async (id, doc) => {
    const { vault, masterKey, nodeKeys } = get();
    if (!vault || !masterKey) return;
    const node = findNode(vault.tree, id);
    if (!node) return;
    let payload = await encryptToB64(masterKey, JSON.stringify(doc));
    if (node.locked) {
      const nodeKey = nodeKeys.get(id);
      if (!nodeKey) return;
      payload = await encryptToB64(nodeKey, payload);
    }
    const nextTree = applyToNode(vault.tree, id, (n) => ({ ...n, content: payload, modifiedAt: Date.now() }));
    set({ vault: { ...vault, tree: nextTree }, dirty: true });
  },

  openFile: (node) => {
    const { sessionUnlockedIds } = get();
    if (node.locked && !sessionUnlockedIds.has(node.id)) {
      get().toggleNodeLock(node.id);
      return;
    }
    set({ activeFileId: node.id, activeBookmarkId: null });
  },

  navigateToBookmark: (targetBookmarkId) => {
    const { vault, activeFileId, activeBookmarkId, sessionUnlockedIds, navBack } = get();
    if (!vault) return;
    const entry = vault.index[targetBookmarkId];
    if (!entry) return;
    const hostNode = findNode(vault.tree, entry.hostFileId);
    if (!hostNode) return;
    if (hostNode.locked && !sessionUnlockedIds.has(hostNode.id)) {
      get().toggleNodeLock(hostNode.id);
      return;
    }
    const nextBack = activeFileId ? [...navBack, { fileId: activeFileId, bookmarkId: activeBookmarkId }] : navBack;
    set({
      activeFileId: entry.hostFileId,
      activeBookmarkId: targetBookmarkId,
      navBack: nextBack,
      navForward: [],
    });
  },

  goBack: () => {
    const { navBack, navForward, activeFileId, activeBookmarkId } = get();
    if (navBack.length === 0) return;
    const prev = navBack[navBack.length - 1];
    const nextForward = activeFileId
      ? [...navForward, { fileId: activeFileId, bookmarkId: activeBookmarkId }]
      : navForward;
    set({
      activeFileId: prev.fileId,
      activeBookmarkId: prev.bookmarkId,
      navBack: navBack.slice(0, -1),
      navForward: nextForward,
    });
  },

  goForward: () => {
    const { navBack, navForward, activeFileId, activeBookmarkId } = get();
    if (navForward.length === 0) return;
    const next = navForward[navForward.length - 1];
    const nextBack = activeFileId ? [...navBack, { fileId: activeFileId, bookmarkId: activeBookmarkId }] : navBack;
    set({
      activeFileId: next.fileId,
      activeBookmarkId: next.bookmarkId,
      navBack: nextBack,
      navForward: navForward.slice(0, -1),
    });
  },

  addBookmarkToIndex: (bookmarkId, hostFileId) => {
    const { vault } = get();
    if (!vault) return;
    const nextIndex = { ...vault.index, [bookmarkId]: { hostFileId, referrers: [] } };
    set({ vault: { ...vault, index: nextIndex }, dirty: true });
  },

  removeBookmarkFromIndex: (bookmarkId) => {
    const { vault } = get();
    if (!vault) return;
    const nextIndex = { ...vault.index };
    delete nextIndex[bookmarkId];
    set({ vault: { ...vault, index: nextIndex }, dirty: true });
  },

  addReferrerToIndex: (targetBookmarkId, referrerFileId) => {
    const { vault } = get();
    if (!vault) return;
    const entry = vault.index[targetBookmarkId];
    if (!entry || entry.referrers.includes(referrerFileId)) return;
    const nextIndex = {
      ...vault.index,
      [targetBookmarkId]: { ...entry, referrers: [...entry.referrers, referrerFileId] },
    };
    set({ vault: { ...vault, index: nextIndex }, dirty: true });
  },

  removeReferrerFromIndex: (targetBookmarkId, referrerFileId) => {
    const { vault } = get();
    if (!vault) return;
    const entry = vault.index[targetBookmarkId];
    if (!entry) return;
    const nextIndex = {
      ...vault.index,
      [targetBookmarkId]: { ...entry, referrers: entry.referrers.filter((id) => id !== referrerFileId) },
    };
    set({ vault: { ...vault, index: nextIndex }, dirty: true });
  },

  listBookmarksForPicker: async () => {
    const { vault, sessionUnlockedIds, loadNodeContent } = get();
    if (!vault) return [];
    const docCache = new Map<string, JSONContent | null>();
    const entries: PickerEntry[] = [];
    for (const [bookmarkId, entry] of Object.entries(vault.index)) {
      const hostNode = findNode(vault.tree, entry.hostFileId);
      if (!hostNode) continue;
      const locked = hostNode.locked && !sessionUnlockedIds.has(hostNode.id);
      if (locked) {
        entries.push({ bookmarkId, label: null, hostFileId: hostNode.id, hostFileName: hostNode.name, locked: true });
        continue;
      }
      if (!docCache.has(hostNode.id)) {
        docCache.set(hostNode.id, await loadNodeContent(hostNode.id));
      }
      const doc = docCache.get(hostNode.id);
      const label = doc ? extractBookmarks(doc).find((b) => b.bookmarkId === bookmarkId)?.label ?? null : null;
      entries.push({ bookmarkId, label, hostFileId: hostNode.id, hostFileName: hostNode.name, locked: false });
    }
    return entries;
  },

  getReferrerEntries: async (bookmarkIds) => {
    const { vault, sessionUnlockedIds, loadNodeContent } = get();
    if (!vault) return [];
    const targetSet = new Set(bookmarkIds);
    const referrerIds = new Set(bookmarkIds.flatMap((id) => vault.index[id]?.referrers ?? []));
    const entries: ReferrerEntry[] = [];
    for (const referrerId of referrerIds) {
      const node = findNode(vault.tree, referrerId);
      if (!node) continue;
      const locked = node.locked && !sessionUnlockedIds.has(node.id);
      if (locked) {
        entries.push({ fileId: node.id, fileName: node.name, locked: true, snippets: [] });
        continue;
      }
      const doc = await loadNodeContent(referrerId);
      const snippets = doc ? getLinkTextsForTargets(doc, targetSet) : [];
      entries.push({ fileId: node.id, fileName: node.name, locked: false, snippets });
    }
    return entries;
  },

  searchVault: async (query) => {
    const { vault, sessionUnlockedIds, loadNodeContent } = get();
    const q = query.trim();
    if (!vault || !q) return [];

    const allNodes = flattenTree(vault.tree);
    const nameFuse = new Fuse(allNodes, { keys: ["name"], threshold: 0.4 });
    const nameMatchIds = new Set(nameFuse.search(q).map((r) => r.item.id));

    const snippetByFileId = new Map<string, string>();
    for (const node of allNodes) {
      if (node.type !== "file") continue;
      const locked = node.locked && !sessionUnlockedIds.has(node.id);
      if (locked) continue;
      const doc = await loadNodeContent(node.id);
      if (!doc) continue;
      const snippet = buildSnippet(extractPlainText(doc), q);
      if (snippet) snippetByFileId.set(node.id, snippet);
    }

    const resultIds = new Set([...nameMatchIds, ...snippetByFileId.keys()]);
    const results: SearchResult[] = [];
    for (const id of resultIds) {
      const node = allNodes.find((n) => n.id === id);
      if (!node) continue;
      results.push({ fileId: id, fileName: node.name, type: node.type, snippet: snippetByFileId.get(id) ?? null });
    }
    return results;
  },
}));

const AUTOSAVE_DEBOUNCE_MS = 800;
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
useVaultStore.subscribe((state) => {
  if (!state.dirty || !state.vault || !state.filePath) return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    useVaultStore.getState().saveVault();
  }, AUTOSAVE_DEBOUNCE_MS);
});

function applyToNode(root: TreeNode, id: string, fn: (n: TreeNode) => TreeNode): TreeNode {
  if (root.id === id) return fn(root);
  return { ...root, children: root.children.map((c) => applyToNode(c, id, fn)) };
}
