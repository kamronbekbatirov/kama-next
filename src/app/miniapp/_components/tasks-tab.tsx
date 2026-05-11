"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/providers";
import {
  api, jPost, jPatch, jDel,
  TODO_STATUSES, type Todo, type TodoStatus,
} from "./_shared";
import { Pill, Chip, IconButton } from "./dashboard-ui";

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

  const load = useCallback(async () => {
    const data = await api("/api/dashboard/todos");
    if (Array.isArray(data)) setTodos(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const byStatus = useMemo(() => {
    const map: Record<TodoStatus, Todo[]> = { todo: [], doing: [], done: [] };
    for (const todo of todos) {
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
      />
    </div>
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
      <div className="flex items-center justify-between px-1.5 pt-1 pb-0.5">
        <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--muted)] truncate">
          {title}
        </div>
        <span className="text-[10px] tabular-nums font-semibold text-[var(--muted)]">
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
          "mt-auto flex items-center justify-center gap-1 py-1.5 rounded-lg",
          "text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]",
          "hover:bg-[var(--surface-2)] transition-colors cursor-pointer",
        ].join(" ")}
        aria-label="add task"
      >
        <Plus className="h-3 w-3" />
        {addHint}
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
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <button
        onClick={onClick}
        className="w-full text-left"
        // Avoid intercepting drag — click only fires if drag didn't pass the threshold.
        onPointerDown={(e) => e.stopPropagation()}
      >
        <TodoCard todo={todo} catLabel={catLabel} />
      </button>
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
  const [cat, setCat]   = useState("general");
  const [pri, setPri]   = useState("medium");

  const CATS = Object.keys(d.cats) as (keyof typeof d.cats)[];
  const PRIS = Object.keys(d.prios) as (keyof typeof d.prios)[];

  const save = async () => {
    if (!text.trim()) return;
    await jPost("/api/dashboard/todos", { text: text.trim(), category: cat, priority: pri, status });
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{d.cols[status]}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && save()}
            placeholder={d.placeholder}
            autoFocus
          />
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] font-medium mb-1.5">Category</div>
            <div className="flex gap-1.5 flex-wrap">
              {CATS.map(c => (
                <Pill key={c} size="sm" active={cat === c} onClick={() => setCat(c)}>
                  {d.cats[c]}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] font-medium mb-1.5">Priority</div>
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
  todo, onClose, onSaved, onDeleted,
}: {
  todo: Todo | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: (id: number) => void;
}) {
  const { t } = useLang();
  const d = t.dash.tasks;
  const j = t.dash.jobs;
  const [text, setText] = useState("");
  const [cat, setCat]   = useState("general");
  const [pri, setPri]   = useState("medium");
  const [status, setStatus] = useState<TodoStatus>("todo");

  useEffect(() => {
    if (todo) {
      setText(todo.text);
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
    await jPatch("/api/dashboard/todos", { id: todo.id, text: text.trim(), category: cat, priority: pri });
    if (status !== todo.status) {
      await jPatch("/api/dashboard/todos", { id: todo.id, status });
    }
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose}>
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
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] font-medium mb-1.5">Status</div>
            <div className="flex gap-1.5">
              {TODO_STATUSES.map(s => (
                <Pill key={s} size="sm" active={status === s} onClick={() => setStatus(s)}>
                  {d.cols[s]}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] font-medium mb-1.5">Category</div>
            <div className="flex gap-1.5 flex-wrap">
              {CATS.map(c => (
                <Pill key={c} size="sm" active={cat === c} onClick={() => setCat(c)}>
                  {d.cats[c]}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] font-medium mb-1.5">Priority</div>
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
          <IconButton size="md" variant="outline" onClick={() => onDeleted(todo.id)} className="mr-auto hover:text-red-500">
            <Trash2 className="h-4 w-4" />
          </IconButton>
          <Button variant="ghost" onClick={onClose}>{j.cancel}</Button>
          <Button onClick={save} disabled={!text.trim()}>{j.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
