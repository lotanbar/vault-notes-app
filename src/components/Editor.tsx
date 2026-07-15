import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import {
  Bold as BoldIcon,
  Underline as UnderlineIcon,
  Minus,
  Plus,
  Undo2,
  Redo2,
  Bookmark as BookmarkIcon,
  Link2,
  ArrowLeft,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { Indent } from "../editor/indentExtension";
import { BookmarkAnchor } from "../editor/bookmarkExtension";
import { LinkAnchor } from "../editor/linkExtension";
import { useVaultStore } from "../store/vaultStore";
import { getAllBookmarkTexts, applyLinkValidity } from "../lib/bookmarkOps";
import { ConfirmDialog } from "./ConfirmDialog";
import { NewBookmarkPopup } from "./NewBookmarkPopup";
import { BookmarkPickerPopup } from "./BookmarkPickerPopup";
import { ReferrersPopup } from "./ReferrersPopup";

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36];
const DEFAULT_FONT_SIZE = 16;
const SAVE_DEBOUNCE_MS = 500;

interface EditorProps {
  fileId: string;
  fileName: string;
}

interface PendingBookmarkDeletion {
  shrunkIds: string[];
  entangledIds: string[];
}

export function Editor({ fileId, fileName }: EditorProps) {
  const loadNodeContent = useVaultStore((s) => s.loadNodeContent);
  const saveNodeContent = useVaultStore((s) => s.saveNodeContent);
  const addBookmarkToIndex = useVaultStore((s) => s.addBookmarkToIndex);
  const removeBookmarkFromIndex = useVaultStore((s) => s.removeBookmarkFromIndex);
  const addReferrerToIndex = useVaultStore((s) => s.addReferrerToIndex);
  const activeBookmarkId = useVaultStore((s) => s.activeBookmarkId);
  const navBack = useVaultStore((s) => s.navBack);
  const navForward = useVaultStore((s) => s.navForward);
  const goBack = useVaultStore((s) => s.goBack);
  const goForward = useVaultStore((s) => s.goForward);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDoc = useRef<JSONContent | null>(null);
  const loadedRef = useRef(false);
  const prevBookmarkTextRef = useRef<Map<string, string>>(new Map());
  const skipBookmarkCheckRef = useRef(false);

  const [showNewBookmarkPopup, setShowNewBookmarkPopup] = useState(false);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [pendingBookmarkDeletion, setPendingBookmarkDeletion] = useState<PendingBookmarkDeletion | null>(null);
  const [showReferrers, setShowReferrers] = useState(false);

  const editor = useEditor(
    {
      extensions: [StarterKit, TextStyle, FontSize, Indent, BookmarkAnchor, LinkAnchor],
      content: "",
      onUpdate: ({ editor }) => {
        if (!loadedRef.current) return;

        const nextTexts = getAllBookmarkTexts(editor.getJSON());
        const prevTexts = prevBookmarkTextRef.current;

        if (!skipBookmarkCheckRef.current) {
          const shrunkIds: string[] = [];
          for (const [id, prevText] of prevTexts) {
            const nextText = nextTexts.get(id) ?? "";
            if (nextText.length < prevText.length) shrunkIds.push(id);
          }
          if (shrunkIds.length > 0) {
            const currentIndex = useVaultStore.getState().vault?.index ?? {};
            const entangledIds = shrunkIds.filter((id) => (currentIndex[id]?.referrers.length ?? 0) > 0);
            if (entangledIds.length > 0) {
              editor.commands.undo();
              setPendingBookmarkDeletion({ shrunkIds, entangledIds });
              return;
            }
            for (const id of shrunkIds) {
              if ((nextTexts.get(id) ?? "").length === 0) {
                useVaultStore.getState().removeBookmarkFromIndex(id);
              }
            }
          }
        }
        skipBookmarkCheckRef.current = false;
        prevBookmarkTextRef.current = nextTexts;

        latestDoc.current = editor.getJSON();
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          if (latestDoc.current) saveNodeContent(fileId, latestDoc.current);
        }, SAVE_DEBOUNCE_MS);
      },
    },
    [],
  );

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    loadNodeContent(fileId).then((doc) => {
      if (cancelled) return;
      const vault = useVaultStore.getState().vault;
      const content = doc ? (vault ? applyLinkValidity(doc, vault.index) : doc) : "";
      editor.commands.setContent(content, { emitUpdate: false });
      prevBookmarkTextRef.current = doc ? getAllBookmarkTexts(doc) : new Map();
      loadedRef.current = true;

      const targetBookmarkId = useVaultStore.getState().activeBookmarkId;
      if (targetBookmarkId) {
        const el = editor.view.dom.querySelector(`[data-bookmark-id="${targetBookmarkId}"]`);
        el?.scrollIntoView({ block: "center" });
      }
    });
    return () => {
      cancelled = true;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (latestDoc.current) {
        saveNodeContent(fileId, latestDoc.current);
        latestDoc.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    if (!editor || !loadedRef.current || !activeBookmarkId) return;
    const el = editor.view.dom.querySelector(`[data-bookmark-id="${activeBookmarkId}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [editor, activeBookmarkId]);

  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.key === "Control" || e.key === "Meta") document.body.classList.add("ctrl-pressed");
    }
    function up(e: KeyboardEvent) {
      if (e.key === "Control" || e.key === "Meta") document.body.classList.remove("ctrl-pressed");
    }
    function clear() {
      document.body.classList.remove("ctrl-pressed");
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      document.body.classList.remove("ctrl-pressed");
    };
  }, []);

  const toolbarState = useEditorState({
    editor,
    selector: (ctx) => {
      if (!ctx.editor) return null;
      const fontSizeAttr = ctx.editor.getAttributes("textStyle").fontSize as string | undefined;
      const parsed = fontSizeAttr ? parseInt(fontSizeAttr, 10) : NaN;
      return {
        bold: ctx.editor.isActive("bold"),
        underline: ctx.editor.isActive("underline"),
        canUndo: ctx.editor.can().undo(),
        canRedo: ctx.editor.can().redo(),
        fontSize: Number.isNaN(parsed) ? DEFAULT_FONT_SIZE : parsed,
        hasSelection: !ctx.editor.state.selection.empty,
      };
    },
  });

  function stepFontSize(dir: 1 | -1) {
    if (!editor || !toolbarState) return;
    const current = toolbarState.fontSize;
    const idx = FONT_SIZES.reduce(
      (closest, size, i) =>
        Math.abs(size - current) < Math.abs(FONT_SIZES[closest] - current) ? i : closest,
      0,
    );
    const nextIdx = Math.min(Math.max(idx + dir, 0), FONT_SIZES.length - 1);
    editor.chain().focus().setFontSize(`${FONT_SIZES[nextIdx]}px`).run();
  }

  function handleCreateBookmark(label: string) {
    if (!editor) return;
    const bookmarkId = crypto.randomUUID();
    editor.chain().focus().setBookmark({ bookmarkId, label }).run();
    addBookmarkToIndex(bookmarkId, fileId);
    setShowNewBookmarkPopup(false);
  }

  function handleCreateLink(targetBookmarkId: string) {
    if (!editor) return;
    const linkId = crypto.randomUUID();
    editor.chain().focus().setLinkAnchor({ linkId, targetBookmarkId, broken: false }).run();
    addReferrerToIndex(targetBookmarkId, fileId);
    setShowLinkPicker(false);
  }

  function handleDeleteBookmarkAnyway() {
    if (!pendingBookmarkDeletion || !editor) return;
    skipBookmarkCheckRef.current = true;
    editor.commands.redo();
    const textsAfter = getAllBookmarkTexts(editor.getJSON());
    for (const id of pendingBookmarkDeletion.entangledIds) {
      if ((textsAfter.get(id) ?? "").length === 0) removeBookmarkFromIndex(id);
    }
    setPendingBookmarkDeletion(null);
  }

  if (!editor) return null;

  const selectedText = editor.state.selection.empty
    ? ""
    : editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to);

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <button
          className={`icon-btn${toolbarState?.bold ? " active" : ""}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <BoldIcon size={20} />
        </button>
        <button
          className={`icon-btn${toolbarState?.underline ? " active" : ""}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline"
        >
          <UnderlineIcon size={20} />
        </button>
        <span className="toolbar-divider" />

        <button className="icon-btn" onClick={() => stepFontSize(-1)} title="Decrease font size">
          <Minus size={20} />
        </button>
        <span className="editor-font-size">{toolbarState?.fontSize ?? DEFAULT_FONT_SIZE}px</span>
        <button className="icon-btn" onClick={() => stepFontSize(1)} title="Increase font size">
          <Plus size={20} />
        </button>

        <span className="toolbar-divider" />

        <button
          className="icon-btn"
          onClick={() => setShowNewBookmarkPopup(true)}
          disabled={!toolbarState?.hasSelection}
          title="New Bookmark"
        >
          <BookmarkIcon size={20} />
        </button>
        <button
          className="icon-btn"
          onClick={() => setShowLinkPicker(true)}
          disabled={!toolbarState?.hasSelection}
          title="New Link"
        >
          <Link2 size={20} />
        </button>

        <span className="toolbar-divider" />

        <button
          className="icon-btn"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!toolbarState?.canUndo}
          title="Undo"
        >
          <Undo2 size={20} />
        </button>
        <button
          className="icon-btn"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!toolbarState?.canRedo}
          title="Redo"
        >
          <Redo2 size={20} />
        </button>

        <span className="toolbar-divider spacer-left" />

        <button className="icon-btn" onClick={goBack} disabled={navBack.length === 0} title="Back">
          <ArrowLeft size={20} />
        </button>
        <button className="icon-btn" onClick={goForward} disabled={navForward.length === 0} title="Forward">
          <ArrowRight size={20} />
        </button>
      </div>
      <div className="editor-filename">{fileName}</div>
      <EditorContent editor={editor} className="editor-content" />

      {showNewBookmarkPopup && (
        <NewBookmarkPopup
          defaultLabel={selectedText}
          onSubmit={handleCreateBookmark}
          onCancel={() => setShowNewBookmarkPopup(false)}
        />
      )}
      {showLinkPicker && (
        <BookmarkPickerPopup onSubmit={handleCreateLink} onCancel={() => setShowLinkPicker(false)} />
      )}
      {pendingBookmarkDeletion && !showReferrers && (
        <ConfirmDialog
          title="Bookmark is linked"
          message={
            pendingBookmarkDeletion.entangledIds.length > 1
              ? "Other files link to these bookmarks. Deleting them will break those links."
              : "Other files link to this bookmark. Deleting it will break those links."
          }
          actions={[
            { label: "Show who points here", icon: <Link2 size={18} />, onClick: () => setShowReferrers(true) },
            {
              label: "Delete anyway",
              icon: <Trash2 size={18} />,
              onClick: handleDeleteBookmarkAnyway,
              variant: "danger",
            },
          ]}
          onCancel={() => setPendingBookmarkDeletion(null)}
        />
      )}
      {showReferrers && pendingBookmarkDeletion && (
        <ReferrersPopup bookmarkIds={pendingBookmarkDeletion.entangledIds} onClose={() => setShowReferrers(false)} />
      )}
    </div>
  );
}
