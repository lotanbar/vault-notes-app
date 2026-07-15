import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
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
  UploadCloud,
} from "lucide-react";
import { Indent } from "../editor/indentExtension";
import { BookmarkAnchor } from "../editor/bookmarkExtension";
import { LinkAnchor } from "../editor/linkExtension";
import { useVaultStore } from "../store/vaultStore";
import { getAllBookmarkTexts, applyLinkValidity } from "../lib/bookmarkOps";
import { fileToAttachment, MAX_ATTACHMENT_BYTES } from "../lib/attachmentOps";
import type { Attachment } from "../types/vault";
import { ConfirmDialog } from "./ConfirmDialog";
import { NewBookmarkPopup } from "./NewBookmarkPopup";
import { BookmarkPickerPopup } from "./BookmarkPickerPopup";
import { ReferrersPopup } from "./ReferrersPopup";
import { AttachmentRow } from "./AttachmentRow";

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
  const latestAttachments = useRef<Attachment[]>([]);
  const dragCounter = useRef(0);
  const rejectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);
  const prevBookmarkTextRef = useRef<Map<string, string>>(new Map());
  const skipBookmarkCheckRef = useRef(false);

  const [showNewBookmarkPopup, setShowNewBookmarkPopup] = useState(false);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [pendingBookmarkDeletion, setPendingBookmarkDeletion] = useState<PendingBookmarkDeletion | null>(null);
  const [showReferrers, setShowReferrers] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingDeleteAttachment, setPendingDeleteAttachment] = useState<Attachment | null>(null);
  const [rejectedNames, setRejectedNames] = useState<string[]>([]);

  function flushSave() {
    if (!latestDoc.current) return;
    saveNodeContent(fileId, latestDoc.current, latestAttachments.current);
  }

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
        saveTimer.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
      },
    },
    [],
  );

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    loadNodeContent(fileId).then((result) => {
      if (cancelled) return;
      const doc = result?.doc ?? null;
      const vault = useVaultStore.getState().vault;
      const content = doc ? (vault ? applyLinkValidity(doc, vault.index) : doc) : "";
      editor.commands.setContent(content, { emitUpdate: false });
      latestDoc.current = editor.getJSON();
      prevBookmarkTextRef.current = doc ? getAllBookmarkTexts(doc) : new Map();
      latestAttachments.current = result?.attachments ?? [];
      setAttachments(latestAttachments.current);
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
      if (rejectTimer.current) {
        clearTimeout(rejectTimer.current);
        rejectTimer.current = null;
      }
      if (loadedRef.current) {
        flushSave();
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

  async function handleAddAttachments(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    const accepted = files.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    const rejected = files.filter((f) => f.size > MAX_ATTACHMENT_BYTES).map((f) => f.name);

    if (rejected.length > 0) {
      setRejectedNames(rejected);
      if (rejectTimer.current) clearTimeout(rejectTimer.current);
      rejectTimer.current = setTimeout(() => setRejectedNames([]), 4000);
    }
    if (accepted.length === 0) return;

    const newAttachments = await Promise.all(accepted.map(fileToAttachment));
    const next = [...latestAttachments.current, ...newAttachments];
    latestAttachments.current = next;
    setAttachments(next);
    flushSave();
  }

  function handleConfirmDeleteAttachment() {
    if (!pendingDeleteAttachment) return;
    const next = latestAttachments.current.filter((a) => a.id !== pendingDeleteAttachment.id);
    latestAttachments.current = next;
    setAttachments(next);
    flushSave();
    setPendingDeleteAttachment(null);
  }

  async function handleOpenAttachment(attachment: Attachment) {
    try {
      const path = await invoke<string>("write_temp_attachment", {
        name: attachment.name,
        dataB64: attachment.data,
      });
      await openPath(path);
    } catch (e) {
      console.error("Failed to open attachment:", e);
    }
  }

  function handleDragEnter(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounter.current += 1;
    setIsDragOver(true);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDragOver(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) handleAddAttachments(e.dataTransfer.files);
  }

  if (!editor) return null;

  const selectedText = editor.state.selection.empty
    ? ""
    : editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to);

  return (
    <div
      className="editor"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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

      {rejectedNames.length > 0 && (
        <p className="attachment-reject-msg">
          {rejectedNames.length === 1
            ? `"${rejectedNames[0]}" exceeds the 10MB attachment limit.`
            : `${rejectedNames.length} files exceed the 10MB attachment limit.`}
        </p>
      )}
      <AttachmentRow
        attachments={attachments}
        onOpen={handleOpenAttachment}
        onRequestDelete={setPendingDeleteAttachment}
      />

      <div className="editor-filename">{fileName}</div>
      <EditorContent editor={editor} className="editor-content" />

      {isDragOver && (
        <div className="drop-overlay">
          <UploadCloud size={40} />
          <span className="drop-overlay-text">Drop files here</span>
        </div>
      )}

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
      {pendingDeleteAttachment && (
        <ConfirmDialog
          title="Delete attachment?"
          message={`Remove "${pendingDeleteAttachment.name}" from this note? This can't be undone.`}
          actions={[
            {
              label: "Delete",
              icon: <Trash2 size={18} />,
              onClick: handleConfirmDeleteAttachment,
              variant: "danger",
            },
          ]}
          onCancel={() => setPendingDeleteAttachment(null)}
        />
      )}
    </div>
  );
}
