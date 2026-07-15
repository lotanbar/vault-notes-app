import { Extension } from "@tiptap/core";

const INDENT_STEP_PX = 24;
const MAX_INDENT_LEVEL = 8;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

export const Indent = Extension.create({
  name: "indent",

  addOptions() {
    return { types: ["paragraph", "heading"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              const margin = parseInt(element.style.marginLeft || "0", 10);
              return Number.isNaN(margin) ? 0 : Math.round(margin / INDENT_STEP_PX);
            },
            renderHTML: (attributes) => {
              if (!attributes.indent) return {};
              return { style: `margin-left: ${attributes.indent * INDENT_STEP_PX}px` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const types: string[] = this.options.types;
    return {
      indent:
        () =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          let changed = false;
          state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (types.includes(node.type.name)) {
              const level = Math.min((node.attrs.indent ?? 0) + 1, MAX_INDENT_LEVEL);
              if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: level });
              changed = true;
            }
          });
          return changed;
        },
      outdent:
        () =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          let changed = false;
          state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (types.includes(node.type.name)) {
              const level = Math.max((node.attrs.indent ?? 0) - 1, 0);
              if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: level });
              changed = true;
            }
          });
          return changed;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.indent(),
      "Shift-Tab": () => this.editor.commands.outdent(),
    };
  },
});
