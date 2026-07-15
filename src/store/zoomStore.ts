import { create } from "zustand";

export type ZoomScope = "ui" | "editor";

const ZOOM_LEVELS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const UI_ZOOM_KEY = "vault-notes-ui-zoom";
const EDITOR_ZOOM_KEY = "vault-notes-editor-zoom";

function storageKey(scope: ZoomScope) {
  return scope === "ui" ? UI_ZOOM_KEY : EDITOR_ZOOM_KEY;
}

function loadZoom(scope: ZoomScope): number {
  const raw = localStorage.getItem(storageKey(scope));
  const parsed = raw ? Number(raw) : NaN;
  return ZOOM_LEVELS.includes(parsed) ? parsed : 1;
}

function closestLevelIndex(value: number): number {
  return ZOOM_LEVELS.reduce(
    (closest, level, i) => (Math.abs(level - value) < Math.abs(ZOOM_LEVELS[closest] - value) ? i : closest),
    0,
  );
}

interface ZoomState {
  uiZoom: number;
  editorZoom: number;
  zoomIn: (scope: ZoomScope) => void;
  zoomOut: (scope: ZoomScope) => void;
  zoomReset: (scope: ZoomScope) => void;
}

export const useZoomStore = create<ZoomState>((set, get) => {
  function step(scope: ZoomScope, dir: 1 | -1) {
    const key = scope === "ui" ? "uiZoom" : "editorZoom";
    const current = get()[key];
    const idx = closestLevelIndex(current);
    const nextIdx = Math.min(Math.max(idx + dir, 0), ZOOM_LEVELS.length - 1);
    const next = ZOOM_LEVELS[nextIdx];
    localStorage.setItem(storageKey(scope), String(next));
    set({ [key]: next } as Partial<ZoomState>);
  }

  return {
    uiZoom: loadZoom("ui"),
    editorZoom: loadZoom("editor"),
    zoomIn: (scope) => step(scope, 1),
    zoomOut: (scope) => step(scope, -1),
    zoomReset: (scope) => {
      const key = scope === "ui" ? "uiZoom" : "editorZoom";
      localStorage.setItem(storageKey(scope), "1");
      set({ [key]: 1 } as Partial<ZoomState>);
    },
  };
});
