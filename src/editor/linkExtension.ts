import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { useVaultStore } from "../store/vaultStore";

export interface LinkAttrs {
  linkId: string;
  targetBookmarkId: string;
  broken?: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    linkAnchor: {
      setLinkAnchor: (attrs: LinkAttrs) => ReturnType;
      unsetLinkAnchor: () => ReturnType;
    };
  }
}

export const LinkAnchor = Mark.create({
  name: "link",
  inclusive: false,

  addAttributes() {
    return {
      linkId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-link-id"),
        renderHTML: (attrs) => ({ "data-link-id": attrs.linkId }),
      },
      targetBookmarkId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-target-bookmark-id"),
        renderHTML: (attrs) => ({ "data-target-bookmark-id": attrs.targetBookmarkId }),
      },
      broken: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-broken") === "true",
        renderHTML: (attrs) => ({ "data-broken": attrs.broken ? "true" : "false" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-link-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "link-anchor" }), 0];
  },

  addCommands() {
    return {
      setLinkAnchor:
        (attrs: LinkAttrs) =>
        ({ commands }) =>
          commands.setMark(this.name, attrs),
      unsetLinkAnchor:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            click(_view, event) {
              if (!(event.ctrlKey || event.metaKey)) return false;
              const target = (event.target as HTMLElement).closest<HTMLElement>("[data-target-bookmark-id]");
              if (!target) return false;
              const targetBookmarkId = target.dataset.targetBookmarkId;
              if (!targetBookmarkId) return false;
              event.preventDefault();
              useVaultStore.getState().navigateToBookmark(targetBookmarkId);
              return true;
            },
          },
        },
      }),
    ];
  },
});
