"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Check, ListTodo, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/providers";
import { api, jPost, jPatch, jDel, type Todo } from "./_shared";
import { Pill, EmptyState, Chip, SoftCard } from "./dashboard-ui";

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-emerald-500",
};

export function TasksTab() {
  const { t } = useLang();
  const d = t.dash.tasks;
  const [todos, setTodos]   = useState<Todo[]>([]);
  const [text, setText]     = useState("");
  const [cat, setCat]       = useState("general");
  const [pri, setPri]       = useState("medium");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"active"|"all"|"done">("active");
  const [editing, setEditing] = useState<Todo | null>(null);

  const load = useCallback(async () => {
    const data = await api("/api/dashboard/todos");
    if (Array.isArray(data)) setTodos(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!text.trim()) return;
    setAdding(false);
    await jPost("/api/dashboard/todos", { text: text.trim(), category: cat, priority: pri });
    setText(""); load();
  };

  const filtered = todos.filter(t =>
    filter === "all" ? true : filter === "active" ? !t.done : t.done
  );

  const CATS = Object.keys(d.cats) as (keyof typeof d.cats)[];
  const PRIS = Object.keys(d.prios) as (keyof typeof d.prios)[];

  const counts = {
    active: todos.filter(t => !t.done).length,
    all: todos.length,
    done: todos.filter(t => t.done).length,
  };

  return (
    <div className="flex flex-col gap-4 pt-2 animate-fade-in">

      {/* Filter + add row */}
      <div className="flex items-center gap-2">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as "active"|"all"|"done")}>
          <TabsList>
            <TabsTrigger value="active">
              {d.active}
              <span className="ml-1 tabular-nums opacity-60">{counts.active}</span>
            </TabsTrigger>
            <TabsTrigger value="all">
              {d.all}
              <span className="ml-1 tabular-nums opacity-60">{counts.all}</span>
            </TabsTrigger>
            <TabsTrigger value="done">
              {d.done}
              <span className="ml-1 tabular-nums opacity-60">{counts.done}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <button
          onClick={() => setAdding(v => !v)}
          aria-label="add"
          className={[
            "ml-auto h-9 w-9 rounded-full transition-all flex items-center justify-center cursor-pointer shrink-0",
            "bg-[var(--foreground)] text-[var(--background)] hover:opacity-85",
            adding ? "rotate-45" : "",
          ].join(" ")}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <Card className="p-4 space-y-3 animate-fade-in">
          <Input
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && add()}
            placeholder={d.placeholder}
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
          <button
            onClick={add}
            disabled={!text.trim()}
            className="w-full h-10 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-sm font-semibold hover:opacity-85 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            {d.addTask}
          </button>
        </Card>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <SoftCard>
          <EmptyState
            icon={<ListTodo className="h-8 w-8" />}
            title={d.noTasks}
            hint={filter === "active" ? d.add : undefined}
          />
        </SoftCard>
      ) : (
        <Card className="p-2">
          <div className="flex flex-col">
            {filtered.map((todo, idx) => (
              <div
                key={todo.id}
                className={[
                  "flex items-start gap-3 py-2.5 px-2 rounded-xl transition-colors",
                  idx > 0 ? "border-t border-[var(--card-border)]" : "",
                ].join(" ")}
              >
                <button
                  onClick={() => jPatch("/api/dashboard/todos", { id: todo.id, done: !todo.done }).then(load)}
                  aria-label={todo.done ? "mark active" : "mark done"}
                  className={[
                    "mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all cursor-pointer",
                    todo.done
                      ? "bg-[var(--foreground)] border-[var(--foreground)]"
                      : "border-[var(--card-border)] hover:border-[var(--foreground)]/50",
                  ].join(" ")}
                >
                  {todo.done && <Check className="h-3 w-3 text-[var(--background)]" strokeWidth={3} />}
                </button>
                <button
                  onClick={() => setEditing(todo)}
                  className="flex-1 min-w-0 text-left cursor-pointer hover:bg-[var(--surface-2)] -mx-2 px-2 py-0.5 rounded-lg transition-colors"
                  aria-label="edit"
                >
                  <div className={[
                    "text-sm transition-all",
                    todo.done ? "line-through text-[var(--muted)]" : "",
                  ].join(" ")}>{todo.text}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={["w-1.5 h-1.5 rounded-full shrink-0", PRIORITY_DOT[todo.priority] ?? "bg-[var(--muted)]"].join(" ")} />
                    <Chip tone="muted">
                      {d.cats[todo.category as keyof typeof d.cats] ?? todo.category}
                    </Chip>
                  </div>
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <EditTodoDialog
        todo={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await load(); }}
        onDeleted={async () => { setEditing(null); await load(); }}
      />
    </div>
  );
}

function EditTodoDialog({
  todo, onClose, onSaved, onDeleted,
}: {
  todo: Todo | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { t } = useLang();
  const d = t.dash.tasks;
  const j = t.dash.jobs; // reuse save/cancel keys
  const [text, setText] = useState("");
  const [cat, setCat]   = useState("general");
  const [pri, setPri]   = useState("medium");

  useEffect(() => {
    if (todo) {
      setText(todo.text);
      setCat(todo.category);
      setPri(todo.priority);
    }
  }, [todo]);

  if (!todo) return null;

  const CATS = Object.keys(d.cats) as (keyof typeof d.cats)[];
  const PRIS = Object.keys(d.prios) as (keyof typeof d.prios)[];

  const save = async () => {
    if (!text.trim()) return;
    await jPatch("/api/dashboard/todos", { id: todo.id, text: text.trim(), category: cat, priority: pri });
    onSaved();
  };
  const remove = async () => {
    await jDel("/api/dashboard/todos", { id: todo.id });
    onDeleted();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
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
          <Button variant="outline" onClick={remove} className="mr-auto">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={onClose}>{j.cancel}</Button>
          <Button onClick={save} disabled={!text.trim()}>{j.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
