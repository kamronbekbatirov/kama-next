"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Plus, Trash2, Archive, ArchiveRestore, AlignLeft, GripVertical, Clock, X, Columns3, Rows3, Circle, CircleDot, CircleCheckBig } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DraggableSyntheticListeners,
  type CollisionDetection,
} from "@dnd-kit/core";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/providers";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TrackerTab } from "./tracker";
import {
  api, jPost, jPatch, jDel, useHashView,
  isoToLocalInput, localInputToIso, fmtDue, isOverdue,
  TODO_STATUSES, type Todo, type TodoStatus,
} from "./_shared";
import { Pill, Chip, IconButton } from "./dashboard-ui";
import { useTimezone } from "./timezone";

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-emerald-500",
};

// Drop target = whatever is under the finger/cursor (a card, or the column it's
// held over). `pointerWithin` is reliable on touch and for the narrow 3-column
// layout where corner-distance heuristics would otherwise snap back to the
// source column; `rectIntersection` is the fallback when the pointer is briefly
// outside every droppable (e.g. mid-fling).
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  return pointer.length > 0 ? pointer : rectIntersection(args);
};

// True on touch / pen devices (no precise hover). On those, the whole card is
// not the drag source — a dedicated grip handle is — so the page can still
// scroll when the finger lands anywhere else on the card.
function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return coarse;
}

// Board = three columns side by side (great on a laptop, cramped on a phone).
// List = the same three columns stacked full-width, so a card gets the whole
// screen width and the text is actually readable. Drag & drop works in both.
type TaskView = "board" | "list";
const VIEW_KEY = "kama:tasks:view";

// `null` until resolved on the client — rendering the wrong layout for one
// frame and snapping to the other is worse than a beat of blank space.
function useTaskView(): [TaskView | null, (v: TaskView) => void] {
  const [view, setView] = useState<TaskView | null>(null);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(VIEW_KEY); } catch { /* private mode */ }
    if (saved === "board" || saved === "list") { setView(saved); return; }
    // No preference yet — phones start on the list, wider screens on the board.
    setView(window.matchMedia("(max-width: 640px)").matches ? "list" : "board");
  }, []);
  const choose = useCallback((v: TaskView) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
  }, []);
  return [view, choose];
}

/**
 * The Tasks tab now has two panes: the owner's own kanban, and the shared
 * tracker. It lives here rather than as a seventh nav icon because the bottom
 * nav is a hard-coded six-column grid, and because "things I am tracking" sits
 * naturally beside "things I am doing".
 */
export function TasksTab() {
  const [pane, setPane] = useHashView("tasks", ["own", "tracker"], "own");
  const { t: tt } = useLang();

  return (
    <div className="flex flex-col gap-3 pt-2 animate-fade-in">
      <Tabs value={pane} onValueChange={setPane}>
        <TabsList className="self-start">
          <TabsTrigger value="own">{tt.dash.tabs.tasks}</TabsTrigger>
          <TabsTrigger value="tracker">{tt.dash.tabs.tracker}</TabsTrigger>
        </TabsList>
        <TabsContent value="own"><OwnTasks /></TabsContent>
        <TabsContent value="tracker"><TrackerTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function OwnTasks() {
  const { t } = useLang();
  const d = t.dash.tasks;
  const [todos, setTodos]     = useState<Todo[]>([]);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [addingTo, setAddingTo] = useState<TodoStatus | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const coarse = useCoarsePointer();
  const [view, setView] = useTaskView();

  const load = useCallback(async () => {
    const data = await api("/api/dashboard/todos");
    if (Array.isArray(data)) setTodos(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  // On touch the drag is started from a dedicated grip handle (which sets
  // touch-action: none), so the browser never mistakes a drag for a scroll.
  // A small distance threshold means the card lifts as soon as the finger moves
  // on the handle — no long-press delay, and the rest of the card still scrolls.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { distance: 8 } }),
  );

  const archived = useMemo(() => todos.filter(t => t.archived), [todos]);

  const byStatus = useMemo(() => {
    const map: Record<TodoStatus, Todo[]> = { todo: [], doing: [], done: [] };
    for (const todo of todos) {
      if (todo.archived) continue;
      const st: TodoStatus = TODO_STATUSES.includes(todo.status) ? todo.status : "todo";
      map[st].push(todo);
    }
    for (const k of TODO_STATUSES) {
      map[k].sort((a, b) => a.position - b.position);
    }
    return map;
  }, [todos]);

  const findTodo = (id: number) => todos.find(t => t.id === id) ?? null;
  const findColumn = (id: number | string): TodoStatus | null => {
    if (TODO_STATUSES.includes(id as TodoStatus)) return id as TodoStatus;
    const todo = typeof id === "number" ? findTodo(id) : findTodo(Number(id));
    return todo ? todo.status : null;
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(Number(e.active.id));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = Number(active.id);
    const overId = over.id;
    const from = findColumn(activeId);
    const to = findColumn(overId);
    if (!from || !to) return;

    const todo = findTodo(activeId);
    if (!todo) return;

    const toList = byStatus[to];
    const droppedOnColumn = typeof overId === "string" && TODO_STATUSES.includes(overId as TodoStatus);

    let newColumn: Todo[];
    let targetIndex: number;

    if (from === to) {
      // Reorder inside one column: plain array-move on the *unfiltered* list.
      // The old code compared an index into the list-with-the-card-removed
      // against an index into the list-with-it-still-there, so dragging a card
      // onto the one directly below it always compared equal and bailed out —
      // every downward drag onto an adjacent card was a silent no-op.
      const oldIndex = toList.findIndex(t => t.id === activeId);
      if (oldIndex < 0) return;
      const overIdx = droppedOnColumn ? -1 : toList.findIndex(t => t.id === Number(overId));
      const newIndex = overIdx < 0 ? toList.length - 1 : overIdx;
      if (oldIndex === newIndex) return;
      newColumn = [...toList];
      newColumn.splice(newIndex, 0, newColumn.splice(oldIndex, 1)[0]);
      targetIndex = newIndex;
    } else {
      const rest = toList.filter(t => t.id !== activeId);
      const overIdx = droppedOnColumn ? -1 : rest.findIndex(t => t.id === Number(overId));
      targetIndex = overIdx < 0 ? rest.length : overIdx;
      newColumn = [...rest];
      newColumn.splice(targetIndex, 0, { ...todo, status: to });
    }

    const newPositions = newColumn.map((t, i) => ({ id: t.id, position: i, status: to }));

    // Optimistic update
    setTodos(prev => prev.map(t => {
      if (t.id === activeId) {
        const np = newPositions.find(p => p.id === t.id);
        return { ...t, status: to, position: np?.position ?? t.position, done: to === "done" };
      }
      const np = newPositions.find(p => p.id === t.id);
      if (np) return { ...t, position: np.position };
      return t;
    }));

    // Persist: the moved card's status first, then re-pack the rest of the
    // column. Each PATCH targets a distinct row, so they can go out together
    // instead of one sequential round trip per card.
    await jPatch("/api/dashboard/todos", { id: activeId, status: to, position: targetIndex });
    await Promise.all(
      newPositions
        .filter(np => np.id !== activeId)
        .map(np => jPatch("/api/dashboard/todos", { id: np.id, status: to, position: np.position })),
    );
    // Reload to get fresh state
    load();
  };

  const onDelete = async (id: number) => {
    setEditing(null);
    setTodos(prev => prev.filter(t => t.id !== id));
    await jDel("/api/dashboard/todos", { id });
  };

  const setArchived = async (id: number, archived: boolean) => {
    setEditing(null);
    setTodos(prev => prev.map(t => t.id === id ? { ...t, archived } : t));
    await jPatch("/api/dashboard/todos", { id, archived });
  };

  const activeTodo = activeId ? findTodo(activeId) : null;
  const openCount = byStatus.todo.length + byStatus.doing.length;

  // Layout still unknown (first client frame) — hold the space, don't guess.
  if (!view) return <div className="pt-2 min-h-[200px]" />;

  // One tap walks a task forward: to do → in progress → done → to do.
  const cycleStatus = async (todo: Todo) => {
    const next = TODO_STATUSES[(TODO_STATUSES.indexOf(todo.status) + 1) % TODO_STATUSES.length];
    setTodos(prev => prev.map(t => (t.id === todo.id ? { ...t, status: next, done: next === "done" } : t)));
    await jPatch("/api/dashboard/todos", { id: todo.id, status: next });
    load();
  };

  const catLabel = (cat: string) => d.cats[cat as keyof typeof d.cats] ?? cat;

  return (
    <div className="flex flex-col gap-3 pt-2 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] font-medium truncate">
          {d.active}
          <span className="ml-1.5 tabular-nums font-semibold text-[var(--foreground)]">{openCount}</span>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* The archive used to sit expanded at the bottom of the page, in the
              way of everything above it. It's a rarely-opened drawer, so it
              lives behind this button now. */}
          <IconButton
            size="sm"
            variant="outline"
            onClick={() => setArchiveOpen(true)}
            aria-label={d.archive}
            title={d.archive}
            className="relative"
          >
            <Archive className="h-3.5 w-3.5" />
            {archived.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-[var(--muted-bg)] text-[var(--foreground)] text-[9px] font-bold leading-[15px] tabular-nums">
                {archived.length}
              </span>
            )}
          </IconButton>
          <ViewToggle value={view} onChange={setView} labels={{ board: d.viewBoard, list: d.viewList }} />
        </div>
      </div>

      {view === "list" ? (
        // Rows, not cards: a tap on the status glyph advances the task, a tap
        // on the row opens it. No drag handles — on a phone the one-tap cycle
        // is what moving a card between columns was for.
        <div className="flex flex-col gap-4">
          {TODO_STATUSES.map(status => (
            <TaskGroup
              key={status}
              status={status}
              todos={byStatus[status]}
              title={d.cols[status]}
              emptyHint={d.emptyColumn}
              addHint={d.addHere}
              catLabel={catLabel}
              onAdd={() => setAddingTo(status)}
              onOpen={setEditing}
              onCycle={cycleStatus}
            />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="grid grid-cols-3 gap-2">
            {TODO_STATUSES.map(status => (
              <KanbanColumn
                key={status}
                status={status}
                todos={byStatus[status]}
                title={d.cols[status]}
                emptyHint={d.emptyColumn}
                addHint={d.addHere}
                coarse={coarse}
                onAdd={() => setAddingTo(status)}
                onCardClick={(todo) => setEditing(todo)}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeTodo ? (
              <TodoCard todo={activeTodo} catLabel={catLabel(activeTodo.category)} dragging />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <ArchiveDialog
        open={archiveOpen}
        archived={archived}
        onClose={() => setArchiveOpen(false)}
        labels={{ title: d.archive, empty: d.archiveEmpty, restore: d.restoreAction, close: t.dash.jobs.cancel }}
        onRestore={(id) => setArchived(id, false)}
        onOpen={(todo) => { setArchiveOpen(false); setEditing(todo); }}
        catLabel={catLabel}
      />

      {addingTo && (
        <AddTodoDialog
          status={addingTo}
          onClose={() => setAddingTo(null)}
          onSaved={async () => { setAddingTo(null); await load(); }}
        />
      )}

      <EditTodoDialog
        todo={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await load(); }}
        onDeleted={onDelete}
        onArchive={(id, archived) => setArchived(id, archived)}
      />
    </div>
  );
}

function ViewToggle({
  value, onChange, labels,
}: {
  value: TaskView;
  onChange: (v: TaskView) => void;
  labels: { board: string; list: string };
}) {
  const opts: { id: TaskView; icon: typeof Columns3; label: string }[] = [
    { id: "list",  icon: Rows3,    label: labels.list },
    { id: "board", icon: Columns3, label: labels.board },
  ];
  return (
    <div
      role="group"
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--card-border)] bg-[var(--surface)] p-1"
    >
      {opts.map(o => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={active}
            aria-label={o.label}
            title={o.label}
            className={[
              "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 transition-all cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              active
                ? "bg-[var(--foreground)] text-[var(--background)] shadow-soft"
                : "text-[var(--muted)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            <o.icon className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const STATUS_GLYPH: Record<TodoStatus, typeof Circle> = {
  todo:  Circle,
  doing: CircleDot,
  done:  CircleCheckBig,
};

/** One task as a row: status glyph · title · meta. Nothing card-shaped. */
function TaskRow({
  todo, catLabel, divider, onOpen, onCycle,
}: {
  todo: Todo;
  catLabel: string;
  divider: boolean;
  onOpen: () => void;
  onCycle: () => void;
}) {
  const { tz } = useTimezone();
  const isDone = todo.status === "done";
  const overdue = !isDone && isOverdue(todo.due_at);
  const due = fmtDue(todo.due_at, tz);
  const Glyph = STATUS_GLYPH[todo.status];

  return (
    <div className={["flex items-start gap-1", divider ? "border-t border-[var(--card-border)]" : ""].join(" ")}>
      {/* 44px tap target — the whole point of the list view is thumb reach. */}
      <button
        type="button"
        onClick={onCycle}
        aria-label={`${todo.text} — next status`}
        className={[
          "shrink-0 h-11 w-11 -ml-1 inline-flex items-center justify-center rounded-full transition-colors cursor-pointer",
          "active:bg-[var(--surface-2)]",
          isDone ? "text-emerald-500" : todo.status === "doing" ? "text-[var(--foreground)]" : "text-[var(--muted)]",
        ].join(" ")}
      >
        <Glyph className="h-5 w-5" strokeWidth={2} />
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 text-left py-2.5 pr-1 cursor-pointer"
      >
        <div className={["text-sm leading-snug", isDone ? "line-through text-[var(--muted)]" : ""].join(" ")}>
          {todo.text}
        </div>
        {todo.description?.trim() && (
          <div className="text-xs text-[var(--muted)] line-clamp-1 mt-0.5">{todo.description.trim()}</div>
        )}
        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[var(--muted)]">
          <span className={["w-1.5 h-1.5 rounded-full shrink-0", PRIORITY_DOT[todo.priority] ?? "bg-[var(--muted)]"].join(" ")} />
          <span className="uppercase tracking-wide truncate">{catLabel}</span>
          {todo.due_at && (
            <span className={[
              "inline-flex items-center gap-0.5 tabular-nums whitespace-nowrap ml-auto shrink-0",
              overdue ? "text-red-500 font-semibold" : "",
            ].join(" ")}>
              <Clock className="h-3 w-3" />
              {due}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

/** A status section in the list view: header, rows, inline add. */
function TaskGroup({
  status, todos, title, emptyHint, addHint, catLabel, onAdd, onOpen, onCycle,
}: {
  status: TodoStatus;
  todos: Todo[];
  title: string;
  emptyHint: string;
  addHint: string;
  catLabel: (cat: string) => string;
  onAdd: () => void;
  onOpen: (todo: Todo) => void;
  onCycle: (todo: Todo) => void;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 px-1 mb-1.5">
        <span className="text-[11px] uppercase tracking-[0.16em] font-semibold text-[var(--muted)]">
          {title}
        </span>
        <span className="text-[11px] tabular-nums text-[var(--muted)]">{todos.length}</span>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`${addHint} — ${title}`}
          className="ml-auto h-8 w-8 inline-flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>

      {todos.length === 0 ? (
        <button
          type="button"
          onClick={onAdd}
          className="w-full text-[11px] italic text-[var(--muted)] py-3 rounded-xl border border-dashed border-[var(--card-border)] hover:border-[var(--foreground)]/30 hover:text-[var(--foreground)] transition-colors cursor-pointer"
        >
          {emptyHint}
        </button>
      ) : (
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-3">
          {todos.map((todo, i) => (
            <TaskRow
              key={todo.id}
              todo={todo}
              catLabel={catLabel(todo.category)}
              divider={i > 0}
              onOpen={() => onOpen(todo)}
              onCycle={() => onCycle(todo)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ArchiveDialog({
  open, archived, onClose, labels, onRestore, onOpen, catLabel,
}: {
  open: boolean;
  archived: Todo[];
  onClose: () => void;
  labels: { title: string; empty: string; restore: string; close: string };
  onRestore: (id: number) => void;
  onOpen: (todo: Todo) => void;
  catLabel: (cat: string) => string;
}) {
  if (!open) return null;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            {labels.title}
            <span className="text-xs font-normal text-[var(--muted)] tabular-nums">{archived.length}</span>
          </DialogTitle>
        </DialogHeader>

        {archived.length === 0 ? (
          <div className="text-xs text-center text-[var(--muted)] py-8 italic">{labels.empty}</div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
            {archived.map((todo, i) => (
              <div
                key={todo.id}
                className={["flex items-center gap-2", i > 0 ? "border-t border-[var(--card-border)]" : ""].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => onOpen(todo)}
                  className="flex-1 min-w-0 text-left py-3 cursor-pointer"
                >
                  <div className="text-sm truncate">{todo.text}</div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--muted)] mt-0.5">
                    {catLabel(todo.category)}
                  </div>
                </button>
                <IconButton
                  size="sm"
                  variant="outline"
                  onClick={() => onRestore(todo.id)}
                  aria-label={labels.restore}
                  title={labels.restore}
                >
                  <ArchiveRestore className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{labels.close}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KanbanColumn({
  status, todos, title, emptyHint, addHint, coarse, onAdd, onCardClick,
}: {
  status: TodoStatus;
  todos: Todo[];
  title: string;
  emptyHint: string;
  addHint: string;
  coarse: boolean;
  onAdd: () => void;
  onCardClick: (todo: Todo) => void;
}) {
  const { t } = useLang();
  const d = t.dash.tasks;
  const { isOver, setNodeRef } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={[
        "flex flex-col rounded-2xl border transition-colors gap-1.5 p-2 min-h-[180px]",
        isOver
          ? "border-[var(--foreground)]/40 bg-[var(--surface-2)]"
          : "border-[var(--card-border)] bg-[var(--card)]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-1 px-1.5 pt-1 pb-0.5">
        <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--muted)] truncate flex-1 min-w-0">
          {title}
        </div>
        <span className="text-[10px] tabular-nums font-semibold text-[var(--muted)] shrink-0">
          {todos.length}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <SortableContext items={todos.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {todos.map(todo => (
            <SortableTodoCard
              key={todo.id}
              todo={todo}
              catLabel={d.cats[todo.category as keyof typeof d.cats] ?? todo.category}
              coarse={coarse}
              onClick={() => onCardClick(todo)}
            />
          ))}
        </SortableContext>
        {todos.length === 0 && (
          <div className="text-[10px] text-center text-[var(--muted)] py-3 italic">
            {emptyHint}
          </div>
        )}
      </div>

      <button
        onClick={onAdd}
        className={[
          "mt-auto flex items-center justify-center gap-1.5 py-1.5 rounded-lg",
          "text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]",
          "hover:bg-[var(--surface-2)] transition-colors cursor-pointer",
        ].join(" ")}
        aria-label="add task"
      >
        <Plus className="h-3 w-3" strokeWidth={2.5} />
        <span>{addHint}</span>
      </button>
    </div>
  );
}

function SortableTodoCard({
  todo, catLabel, coarse, onClick,
}: {
  todo: Todo;
  catLabel: string;
  coarse: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    // Touch: let the card body scroll the page (drag comes from the handle).
    // Mouse: the whole card is the drag source.
    touchAction: coarse ? "pan-y" : "manipulation",
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(coarse ? {} : listeners)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={["select-none", coarse ? "" : "cursor-grab active:cursor-grabbing"].join(" ")}
    >
      <TodoCard todo={todo} catLabel={catLabel} dragHandleProps={coarse ? listeners : undefined} />
    </div>
  );
}

function TodoCard({
  todo, catLabel, dragging = false, dragHandleProps,
}: {
  todo: Todo;
  catLabel: string;
  dragging?: boolean;
  dragHandleProps?: DraggableSyntheticListeners;
}) {
  const isDone = todo.status === "done";
  const overdue = !isDone && isOverdue(todo.due_at);
  const { tz } = useTimezone();
  const due = fmtDue(todo.due_at, tz);
  return (
    <div
      className={[
        "relative rounded-xl border border-[var(--card-border)] bg-[var(--surface)] p-2.5 shadow-soft",
        "hover:border-[var(--foreground)]/30 transition-colors",
        dragging ? "ring-2 ring-[var(--foreground)]/20 shadow-pop scale-[1.02]" : "",
      ].join(" ")}
    >
      {dragHandleProps && (
        <span
          {...dragHandleProps}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-1 right-1 p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] touch-none cursor-grab active:cursor-grabbing"
          aria-label="drag to move"
        >
          <GripVertical className="h-4 w-4" />
        </span>
      )}
      <div className={[
        "text-xs font-medium leading-snug",
        dragHandleProps ? "pr-6" : "",
        isDone ? "line-through text-[var(--muted)]" : "",
      ].join(" ")}>
        {todo.text}
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <span className={["w-1.5 h-1.5 rounded-full shrink-0", PRIORITY_DOT[todo.priority] ?? "bg-[var(--muted)]"].join(" ")} />
        <Chip tone="muted" className="text-[9px] px-1.5 py-0">
          {catLabel}
        </Chip>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {todo.due_at && (
            <span
              className={[
                "inline-flex items-center gap-0.5 text-[9px] tabular-nums whitespace-nowrap",
                overdue ? "text-red-500 font-semibold" : "text-[var(--muted)]",
              ].join(" ")}
              title={due}
            >
              <Clock className="h-2.5 w-2.5" />
              {due}
            </span>
          )}
          {todo.description && (
            <AlignLeft className="h-3 w-3 text-[var(--muted)] shrink-0" aria-label="has description" />
          )}
        </div>
      </div>
    </div>
  );
}

// Optional deadline picker (date + time), shared by the add/edit dialogs.
function DueField({
  value, onChange, label, clearLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  clearLabel: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] font-medium mb-1.5">{label}</div>
      <div className="flex items-center gap-1.5">
        <Input
          type="datetime-local"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-10 flex-1"
        />
        {value && (
          <IconButton
            size="md"
            variant="outline"
            onClick={() => onChange("")}
            aria-label={clearLabel}
            title={clearLabel}
          >
            <X className="h-4 w-4" />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function AddTodoDialog({
  status, onClose, onSaved,
}: {
  status: TodoStatus;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const d = t.dash.tasks;
  const j = t.dash.jobs;
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [cat, setCat]   = useState("general");
  const [pri, setPri]   = useState("medium");
  const [due, setDue]   = useState("");

  const CATS = Object.keys(d.cats) as (keyof typeof d.cats)[];
  const PRIS = Object.keys(d.prios) as (keyof typeof d.prios)[];

  const save = async () => {
    if (!text.trim()) return;
    await jPost("/api/dashboard/todos", {
      text: text.trim(),
      description: description.trim() || undefined,
      category: cat,
      priority: pri,
      status,
      due_at: localInputToIso(due),
    });
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{d.cols[status]}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && save()}
            placeholder={d.placeholder}
            autoFocus
          />
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={d.descPlaceholder}
            rows={5}
            className="resize-y min-h-[110px]"
          />
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] font-medium mb-1.5">{d.category}</div>
            <div className="flex gap-1.5 flex-wrap">
              {CATS.map(c => (
                <Pill key={c} size="sm" active={cat === c} onClick={() => setCat(c)}>
                  {d.cats[c]}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] font-medium mb-1.5">{d.priority}</div>
            <div className="flex gap-1.5">
              {PRIS.map(p => (
                <Pill key={p} size="sm" active={pri === p} onClick={() => setPri(p)}>
                  <span className={["w-1.5 h-1.5 rounded-full", PRIORITY_DOT[p]].join(" ")} />
                  {d.prios[p]}
                </Pill>
              ))}
            </div>
          </div>
          <DueField value={due} onChange={setDue} label={d.dueDate} clearLabel={d.dueClear} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{j.cancel}</Button>
          <Button onClick={save} disabled={!text.trim()}>{j.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditTodoDialog({
  todo, onClose, onSaved, onDeleted, onArchive,
}: {
  todo: Todo | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: (id: number) => void;
  onArchive: (id: number, archived: boolean) => void;
}) {
  const { t } = useLang();
  const d = t.dash.tasks;
  const j = t.dash.jobs;
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [cat, setCat]   = useState("general");
  const [pri, setPri]   = useState("medium");
  const [status, setStatus] = useState<TodoStatus>("todo");
  const [due, setDue]   = useState("");

  useEffect(() => {
    if (todo) {
      setText(todo.text);
      setDescription(todo.description ?? "");
      setCat(todo.category);
      setPri(todo.priority);
      setStatus(todo.status);
      setDue(isoToLocalInput(todo.due_at));
    }
  }, [todo]);

  if (!todo) return null;

  const CATS = Object.keys(d.cats) as (keyof typeof d.cats)[];
  const PRIS = Object.keys(d.prios) as (keyof typeof d.prios)[];

  const save = async () => {
    if (!text.trim()) return;
    await jPatch("/api/dashboard/todos", {
      id: todo.id,
      text: text.trim(),
      description,
      category: cat,
      priority: pri,
      due_at: localInputToIso(due),
    });
    if (status !== todo.status) {
      await jPatch("/api/dashboard/todos", { id: todo.id, status });
    }
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{d.cols[status]}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={d.placeholder}
            autoFocus
          />
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={d.descPlaceholder}
            rows={6}
            className="resize-y min-h-[140px]"
          />
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] font-medium mb-1.5">{d.status}</div>
            <div className="flex gap-1.5">
              {TODO_STATUSES.map(s => (
                <Pill key={s} size="sm" active={status === s} onClick={() => setStatus(s)}>
                  {d.cols[s]}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] font-medium mb-1.5">{d.category}</div>
            <div className="flex gap-1.5 flex-wrap">
              {CATS.map(c => (
                <Pill key={c} size="sm" active={cat === c} onClick={() => setCat(c)}>
                  {d.cats[c]}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] font-medium mb-1.5">{d.priority}</div>
            <div className="flex gap-1.5">
              {PRIS.map(p => (
                <Pill key={p} size="sm" active={pri === p} onClick={() => setPri(p)}>
                  <span className={["w-1.5 h-1.5 rounded-full", PRIORITY_DOT[p]].join(" ")} />
                  {d.prios[p]}
                </Pill>
              ))}
            </div>
          </div>
          <DueField value={due} onChange={setDue} label={d.dueDate} clearLabel={d.dueClear} />
        </div>
        <DialogFooter>
          <IconButton size="md" variant="outline" onClick={() => onDeleted(todo.id)} className="mr-auto hover:text-red-500" aria-label="delete">
            <Trash2 className="h-4 w-4" />
          </IconButton>
          <IconButton
            size="md"
            variant="outline"
            onClick={() => onArchive(todo.id, !todo.archived)}
            aria-label={todo.archived ? d.restoreAction : d.archiveAction}
            title={todo.archived ? d.restoreAction : d.archiveAction}
          >
            {todo.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </IconButton>
          <Button variant="ghost" onClick={onClose}>{j.cancel}</Button>
          <Button onClick={save} disabled={!text.trim()}>{j.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

