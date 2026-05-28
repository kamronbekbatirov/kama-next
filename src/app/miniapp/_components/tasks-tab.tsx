"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Archive, ArchiveRestore, ChevronDown, ChevronRight, AlignLeft } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/providers";
import {
  api, jPost, jPatch, jDel,
  TODO_STATUSES, type Todo, type TodoStatus,
} from "./_shared";
import { Pill, Chip, IconButton, CopyButton } from "./dashboard-ui";

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-emerald-500",
};

export function TasksTab() {
  const { t } = useLang();
  const d = t.dash.tasks;
  const [todos, setTodos]     = useState<Todo[]>([]);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [addingTo, setAddingTo] = useState<TodoStatus | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const load = useCallback(async () => {
    const data = await api("/api/dashboard/todos");
    if (Array.isArray(data)) setTodos(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Mobile drag was laggy because the TouchSensor delay was high enough that
  // the page would scroll first; cutting the delay and widening the tolerance
  // makes a long-press pick up the card almost immediately.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 120, tolerance: 12 } }),
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

    const targetColumn = byStatus[to].filter(t => t.id !== activeId);
    let targetIndex: number;
    if (typeof overId === "string" && TODO_STATUSES.includes(overId as TodoStatus)) {
      targetIndex = targetColumn.length;
    } else {
      const overIdx = targetColumn.findIndex(t => t.id === Number(overId));
      targetIndex = overIdx < 0 ? targetColumn.length : overIdx;
    }

    if (from === to && byStatus[from].findIndex(t => t.id === activeId) === targetIndex) {
      return;
    }

    // Build new ordering
    const newColumn = [...targetColumn];
    newColumn.splice(targetIndex, 0, { ...todo, status: to });
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

    // Persist: status of moved card first, then re-pack positions in the destination column
    await jPatch("/api/dashboard/todos", { id: activeId, status: to, position: targetIndex });
    // Re-pack remaining cards if their position drifted
    for (const np of newPositions) {
      if (np.id === activeId) continue;
      await jPatch("/api/dashboard/todos", { id: np.id, status: to, position: np.position });
    }
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

  return (
    <div className="flex flex-col gap-3 pt-2 animate-fade-in">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
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
              onAdd={() => setAddingTo(status)}
              onCardClick={(todo) => setEditing(todo)}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTodo ? (
            <TodoCard todo={activeTodo} catLabel={d.cats[activeTodo.category as keyof typeof d.cats] ?? activeTodo.category} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>

      <ArchiveSection
        archived={archived}
        open={archiveOpen}
        onToggle={() => setArchiveOpen(v => !v)}
        labels={{
          title: d.archive,
          empty: d.archiveEmpty,
          restore: d.restoreAction,
        }}
        onRestore={(id) => setArchived(id, false)}
        onCardClick={(todo) => setEditing(todo)}
        catLabel={(cat) => d.cats[cat as keyof typeof d.cats] ?? cat}
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

function ArchiveSection({
  archived, open, onToggle, labels, onRestore, onCardClick, catLabel,
}: {
  archived: Todo[];
  open: boolean;
  onToggle: () => void;
  labels: { title: string; empty: string; restore: string };
  onRestore: (id: number) => void;
  onCardClick: (todo: Todo) => void;
  catLabel: (cat: string) => string;
}) {
  return (
    <section className="mt-2">
      <button
        onClick={onToggle}
        className={[
          "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl",
          "border border-[var(--card-border)] bg-[var(--card)] hover:bg-[var(--surface-2)]",
          "text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)]",
          "transition-colors cursor-pointer",
        ].join(" ")}
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Archive className="h-3.5 w-3.5" />
          <span className="uppercase tracking-[0.14em]">{labels.title}</span>
        </span>
        <span className="tabular-nums">{archived.length}</span>
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-1.5">
          {archived.length === 0 ? (
            <div className="text-[10px] text-center text-[var(--muted)] py-3 italic">
              {labels.empty}
            </div>
          ) : (
            archived.map(todo => (
              <div key={todo.id} className="flex items-stretch gap-1.5">
                <button
                  onClick={() => onCardClick(todo)}
                  className="flex-1 text-left cursor-pointer"
                >
                  <TodoCard todo={todo} catLabel={catLabel(todo.category)} />
                </button>
                <button
                  onClick={() => onRestore(todo.id)}
                  className={[
                    "shrink-0 px-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)]",
                    "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]",
                    "transition-colors cursor-pointer flex items-center justify-center",
                  ].join(" ")}
                  aria-label={labels.restore}
                  title={labels.restore}
                >
                  <ArchiveRestore className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

function KanbanColumn({
  status, todos, title, emptyHint, addHint, onAdd, onCardClick,
}: {
  status: TodoStatus;
  todos: Todo[];
  title: string;
  emptyHint: string;
  addHint: string;
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
        "flex flex-col rounded-2xl border transition-colors p-2 gap-1.5 min-h-[180px]",
        isOver
          ? "border-[var(--foreground)]/40 bg-[var(--surface-2)]"
          : "border-[var(--card-border)] bg-[var(--card)]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-1 px-1.5 pt-1 pb-0.5">
        <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--muted)] truncate flex-1 min-w-0">
          {title}
        </div>
        {todos.length > 0 && (
          <CopyButton
            size="xs"
            className="opacity-50 hover:opacity-100 border-0"
            getText={() =>
              todos
                .map((t, i) => {
                  const body = t.text + (t.description ? `\n   ${t.description.replace(/\n/g, "\n   ")}` : "");
                  return `${i + 1}. ${body}`;
                })
                .join("\n")
            }
            aria-label={d.copyColumn}
            title={d.copyColumn}
          />
        )}
        <span className="text-[10px] tabular-nums font-semibold text-[var(--muted)] shrink-0">
          {todos.length}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {todos.map(todo => (
          <SortableTodoCard
            key={todo.id}
            todo={todo}
            catLabel={d.cats[todo.category as keyof typeof d.cats] ?? todo.category}
            onClick={() => onCardClick(todo)}
          />
        ))}
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
  todo, catLabel, onClick,
}: {
  todo: Todo;
  catLabel: string;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: "manipulation" as const,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      role="button"
      tabIndex={0}
      className="cursor-grab active:cursor-grabbing select-none"
    >
      <TodoCard todo={todo} catLabel={catLabel} />
    </div>
  );
}

function TodoCard({
  todo, catLabel, dragging = false,
}: {
  todo: Todo;
  catLabel: string;
  dragging?: boolean;
}) {
  const isDone = todo.status === "done";
  return (
    <div
      className={[
        "rounded-xl border border-[var(--card-border)] bg-[var(--surface)] p-2.5 shadow-soft",
        "hover:border-[var(--foreground)]/30 transition-colors",
        dragging ? "ring-2 ring-[var(--foreground)]/20 shadow-pop scale-[1.02]" : "",
      ].join(" ")}
    >
      <div className={[
        "text-xs font-medium leading-snug",
        isDone ? "line-through text-[var(--muted)]" : "",
      ].join(" ")}>
        {todo.text}
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <span className={["w-1.5 h-1.5 rounded-full shrink-0", PRIORITY_DOT[todo.priority] ?? "bg-[var(--muted)]"].join(" ")} />
        <Chip tone="muted" className="text-[9px] px-1.5 py-0">
          {catLabel}
        </Chip>
        {todo.description && (
          <AlignLeft
            className="h-3 w-3 text-[var(--muted)] shrink-0 ml-auto"
            aria-label="has description"
          />
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

  useEffect(() => {
    if (todo) {
      setText(todo.text);
      setDescription(todo.description ?? "");
      setCat(todo.category);
      setPri(todo.priority);
      setStatus(todo.status);
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

