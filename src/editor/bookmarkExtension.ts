import { Mark, mergeAttributes } from "@tiptap/core";

export interface BookmarkAttrs {
  bookmarkId: string;
  label: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    bookmark: {
      setBookmark: (attrs: BookmarkAttrs) => ReturnType;
      unsetBookmark: () => ReturnType;
    };
  }
}

export const BookmarkAnchor = Mark.create({
  name: "bookmark",
  inclusive: false,

  addAttributes() {
    return {
      bookmarkId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-bookmark-id"),
        renderHTML: (attrs) => ({ "data-bookmark-id": attrs.bookmarkId }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") ?? "",
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-bookmark-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "bookmark-anchor" }), 0];
  },

  addCommands() {
    return {
      setBookmark:
        (attrs: BookmarkAttrs) =>
        ({ commands }) =>
          commands.setMark(this.name, attrs),
      unsetBookmark:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
