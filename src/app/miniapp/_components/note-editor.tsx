"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { StarterKit } from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import {
  Bold, Italic, Strikethrough, Heading2, List, ListOrdered, ListChecks,
  ArrowUp, ArrowDown, Undo2, Redo2,
} from "lucide-react";
import type { ReactNode } from "react";

// Keep lists going on Enter. TipTap's default lifts (removes) an empty list item
// when you press Enter on it — which looks like the "1." just disappearing. Here
// a non-empty item splits normally (→ 2., 3., …) and an EMPTY item gets a fresh
// sibling instead of being deleted. Exit a list with Backspace or the toolbar.
const ContinueList = Extension.create({
  name: "continueList",
  priority: 1000, // run before the list extensions' own Enter handlers
  addKeyboardShortcuts() {
    const handle = (name: "listItem" | "taskItem") => {
      const { editor } = this;
      if (!editor.isActive(name)) return false;
      const itemEmpty = editor.state.selection.$from.parent.content.size === 0;
      if (!itemEmpty) return editor.commands.splitListItem(name);
      // Empty item → append a new sibling item, don't exit the list.
      return editor.commands.command(({ tr, state, dispatch }) => {
        const { $from } = state.selection;
        let depth = $from.depth;
        while (depth > 0 && $from.node(depth).type.name !== name) depth--;
        if (depth === 0) return false;
        const newItem = $from.node(depth).type.createAndFill();
        if (!newItem) return false;
        if (dispatch) {
          const after = $from.after(depth);
          tr.insert(after, newItem);
          tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
          dispatch(tr.scrollIntoView());
        }
        return true;
      });
    };
    return {
      Enter: () => {
        const { editor } = this;
        if (editor.isActive("taskItem")) return handle("taskItem");
        if (editor.isActive("listItem")) return handle("listItem");
        return false;
      },
    };
  },
});

// Move the current list/checkbox item up or down among its siblings — so you can
// reorder a to-do without retyping. Works by lifting the adjacent sibling over
// the current item and keeping the cursor on the moved item.
function moveListItem(dir: "up" | "down") {
  // Uses the transaction provided by TipTap (props.tr) — NOT state.tr — so the
  // edit is actually dispatched (same pattern as ContinueList above).
  return ({ state, tr, dispatch }: { state: EditorState; tr: Transaction; dispatch?: (tr: Transaction) => void }) => {
    const itemTypes = ["listItem", "taskItem"];
    const { $from } = state.selection;
    let depth = -1;
    for (let i = $from.depth; i > 0; i--) {
      if (itemTypes.includes($from.node(i).type.name)) { depth = i; break; }
    }
    if (depth < 0) return false;

    const item = $from.node(depth);
    const itemPos = $from.before(depth);
    const itemEnd = itemPos + item.nodeSize;
    const parent = $from.node(depth - 1);
    const index = $from.index(depth - 1);

    if (dir === "up") {
      if (index === 0) return false;
      const prev = parent.child(index - 1);
      if (dispatch) {
        tr.delete(itemPos - prev.nodeSize, itemPos);   // remove the previous sibling…
        tr.insert(itemEnd - prev.nodeSize, prev);       // …re-insert it after this item
        tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.map(state.selection.from))));
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    if (index >= parent.childCount - 1) return false;
    const next = parent.child(index + 1);
    if (dispatch) {
      tr.delete(itemEnd, itemEnd + next.nodeSize);      // remove the next sibling…
      tr.insert(itemPos, next);                          // …re-insert it before this item
      tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.map(state.selection.from))));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

const MoveListItem = Extension.create({
  name: "moveListItem",
  priority: 1000, // run before the list extensions' own Backspace handling
  addKeyboardShortcuts() {
    const moveUp = () => this.editor.commands.command(moveListItem("up"));
    const moveDown = () => this.editor.commands.command(moveListItem("down"));
    return {
      "Alt-ArrowUp": moveUp,
      "Alt-ArrowDown": moveDown,
      // Put the cursor at the start of a checkbox/list line and press Backspace
      // ("назад") to send the whole item one line up. Empty items and the very
      // first item fall through to the default, so you can still exit the list.
      Backspace: () => {
        const { editor } = this;
        if (!editor.isActive("taskItem") && !editor.isActive("listItem")) return false;
        const { selection } = editor.state;
        if (!selection.empty) return false;          // a range is selected → normal delete
        const { $from } = selection;
        if ($from.parentOffset !== 0) return false;  // not at the start of the line
        if ($from.parent.content.size === 0) return false; // empty item → default (exit list)
        return moveUp();                             // moves up; false on the first item → default runs
      },
    };
  },
});

// Notes used to be plain text (and Claude writes Markdown converted to HTML).
// Render any plain text as simple HTML so line breaks survive; anything already
// HTML is passed through untouched.
function toInitialHTML(content: string): string {
  const trimmed = (content ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("<")) return content;
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return trimmed
    .split(/\n{2,}/)
    .map(block => `<p>${esc(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function ToolbarButton({
  active, onClick, label, disabled, children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      // Keep the editor's selection while clicking the toolbar.
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={[
        "h-8 w-8 inline-flex items-center justify-center rounded-lg transition-colors shrink-0",
        "disabled:opacity-30 disabled:pointer-events-none",
        active
          ? "bg-[var(--foreground)] text-[var(--background)]"
          : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function NoteEditor({
  value, onChange, placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false, // avoid SSR hydration mismatch (Next App Router)
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      ContinueList,
      MoveListItem,
    ],
    content: toInitialHTML(value),
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: "tiptap min-h-[360px]" },
      // Notion-style: clicking the gutter to the LEFT of a checkbox drops the
      // caret at the start of that line. Uses raw mousedown because clicking the
      // empty gutter (no text under the pointer) makes posAtCoords return null,
      // so ProseMirror's handleClick never fires there. The checkbox itself
      // (inside <label>) still toggles.
      handleDOMEvents: {
        mousedown: (view, event) => {
          const target = event.target as HTMLElement | null;
          if (!target || target.closest("label")) return false;       // checkbox → toggle
          const li = target.closest('ul[data-type="taskList"] > li');
          if (!li) return false;
          const content = li.querySelector(":scope > div");
          if (!(content instanceof HTMLElement)) return false;
          if (event.clientX >= content.getBoundingClientRect().left) return false; // on/after text
          const pos = view.posAtDOM(content, 0);
          event.preventDefault();
          view.dispatch(
            view.state.tr
              .setSelection(TextSelection.near(view.state.doc.resolve(pos), 1))
              .scrollIntoView(),
          );
          view.focus();
          return true;
        },
      },
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const inItem = editor.isActive("listItem") || editor.isActive("taskItem");
  return (
    <div className="flex items-center gap-0.5 flex-wrap border-b border-[var(--card-border)] pb-2 sticky top-0 bg-[var(--background)] z-10">
      <ToolbarButton label="Bold" active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-4 w-4" strokeWidth={2.5} />
      </ToolbarButton>
      <ToolbarButton label="Italic" active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label="Strikethrough" active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>

      <span className="w-px h-5 bg-[var(--card-border)] mx-1" />

      <ToolbarButton label="Heading" active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label="To-do list" active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListChecks className="h-4 w-4" />
      </ToolbarButton>

      <span className="w-px h-5 bg-[var(--card-border)] mx-1" />

      <ToolbarButton label="Move item up (Alt+↑)" disabled={!inItem}
        onClick={() => editor.commands.command(moveListItem("up"))}>
        <ArrowUp className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label="Move item down (Alt+↓)" disabled={!inItem}
        onClick={() => editor.commands.command(moveListItem("down"))}>
        <ArrowDown className="h-4 w-4" />
      </ToolbarButton>

      <span className="w-px h-5 bg-[var(--card-border)] mx-1" />

      <ToolbarButton label="Undo" disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label="Redo" disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}
