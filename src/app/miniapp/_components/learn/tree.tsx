"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, ChevronRight, ChevronDown, BookOpen, Clock, Trash2, ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useLang } from "@/components/providers";
import { learnApi } from "./api";
import type { LearnNode, LearnSession, LearnStatus, LearnSubject } from "./types";

const STATUS_VARIANT: Record<LearnStatus, "outline" | "success" | "warning" | "default"> = {
  not_started: "outline",
  learning: "warning",
  reviewing: "default",
  mastered: "success",
};

function isDue(n: LearnNode): boolean {
  if (!n.next_review) return false;
  return new Date(n.next_review).getTime() <= Date.now();
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  const now = new Date();
  const diff = Math.round((date.getTime() - now.getTime()) / 86400000);
  if (diff <= 0) return "сегодня";
  if (diff === 1) return "завтра";
  if (diff < 7) return `+${diff}д`;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function TreePane() {
  const { t } = useLang();
  const l = t.dash.learn;
  const [subjects, setSubjects] = useState<LearnSubject[]>([]);
  const [activeSubject, setActiveSubject] = useState<LearnSubject | null>(null);
  const [nodes, setNodes] = useState<LearnNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingSubject, setCreatingSubject] = useState(false);
  const [openNode, setOpenNode] = useState<LearnNode | null>(null);

  const refreshSubjects = async () => {
    setLoading(true);
    const data = await learnApi.listSubjects();
    setSubjects(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  const refreshNodes = async (subjectId: number) => {
    const data = await learnApi.listNodes(subjectId);
    setNodes(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    refreshSubjects();
  }, []);

  useEffect(() => {
    if (activeSubject) refreshNodes(activeSubject.id);
  }, [activeSubject]);

  if (loading && !activeSubject) {
    return <div className="text-xs text-[var(--muted)] py-8 text-center">{l.loading}</div>;
  }

  if (!activeSubject) {
    return (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {subjects.length === 0 && (
            <Card className="col-span-full text-center py-10">
              <div className="text-3xl mb-2">🌱</div>
              <div className="text-sm font-semibold">{l.tree.emptySubjectsTitle}</div>
              <div className="text-xs text-[var(--muted)] mt-1">{l.tree.emptySubjectsHint}</div>
            </Card>
          )}
          {subjects.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSubject(s)}
              className="text-left rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-soft hover:shadow-pop transition-all cursor-pointer active:scale-[0.99]"
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl shrink-0">{s.emoji || "📘"}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{s.title}</div>
                  {s.description && (
                    <div className="text-xs text-[var(--muted)] mt-0.5 line-clamp-2">{s.description}</div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-[var(--muted)] shrink-0 mt-1" />
              </div>
            </button>
          ))}
          <button
            onClick={() => setCreatingSubject(true)}
            className="rounded-2xl border border-dashed border-[var(--card-border)] bg-transparent p-4 hover:bg-[var(--muted-bg)] transition-all text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            <span className="text-sm font-semibold">{l.tree.newSubject}</span>
          </button>
        </div>

        <CreateSubjectDialog
          open={creatingSubject}
          onClose={() => setCreatingSubject(false)}
          onCreated={async () => {
            setCreatingSubject(false);
            await refreshSubjects();
          }}
        />
      </>
    );
  }

  return (
    <>
      <SubjectTree
        subject={activeSubject}
        nodes={nodes}
        onBack={() => {
          setActiveSubject(null);
          setNodes([]);
        }}
        onRefresh={() => refreshNodes(activeSubject.id)}
        onRefreshSubject={async () => {
          await refreshSubjects();
          // re-resolve activeSubject from the freshly loaded list
          const fresh = await learnApi.listSubjects();
          if (Array.isArray(fresh)) {
            const updated = fresh.find(s => s.id === activeSubject.id);
            if (updated) setActiveSubject(updated);
          }
        }}
        onOpenNode={setOpenNode}
        onDeleteSubject={async () => {
          if (!confirm(l.tree.confirmDeleteSubject)) return;
          await learnApi.deleteSubject(activeSubject.id);
          setActiveSubject(null);
          await refreshSubjects();
        }}
      />

      <NodeDetailSheet
        node={openNode}
        onClose={() => setOpenNode(null)}
        onUpdated={async () => {
          if (activeSubject) await refreshNodes(activeSubject.id);
        }}
      />
    </>
  );
}

function CreateSubjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useLang();
  const l = t.dash.learn;
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("📘");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) {
      setTitle("");
      setEmoji("📘");
      setDescription("");
    }
  }, [open]);

  const submit = async () => {
    if (!title.trim()) return;
    await learnApi.createSubject({ title: title.trim(), emoji, description: description.trim() });
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{l.tree.newSubject}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={2}
              className="w-16 text-center text-xl"
              placeholder="📘"
            />
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={l.tree.subjectTitlePh}
              autoFocus
            />
          </div>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={l.tree.subjectDescPh}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {l.cancel}
          </Button>
          <Button onClick={submit} disabled={!title.trim()}>
            {l.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubjectTree({
  subject,
  nodes,
  onBack,
  onRefresh,
  onRefreshSubject,
  onOpenNode,
  onDeleteSubject,
}: {
  subject: LearnSubject;
  nodes: LearnNode[];
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onRefreshSubject: () => Promise<void>;
  onOpenNode: (n: LearnNode) => void;
  onDeleteSubject: () => void;
}) {
  const { t } = useLang();
  const l = t.dash.learn;
  const [creating, setCreating] = useState<{ parent: LearnNode | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const byParent = useMemo(() => {
    const map = new Map<number | null, LearnNode[]>();
    for (const n of nodes) {
      const list = map.get(n.parent_id) ?? [];
      list.push(n);
      map.set(n.parent_id, list);
    }
    return map;
  }, [nodes]);

  const roots = byParent.get(null) ?? [];
  const totalProgress = nodes.length
    ? Math.round(nodes.reduce((acc, n) => acc + n.mastery_percent, 0) / nodes.length)
    : 0;
  const dueCount = nodes.filter(isDue).length;

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          {l.back}
        </Button>
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <div className="text-3xl shrink-0">{subject.emoji || "📘"}</div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold truncate">{subject.title}</div>
            {subject.description && (
              <div className="text-xs text-[var(--muted)] mt-0.5">{subject.description}</div>
            )}
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1">
                <Progress value={totalProgress} />
              </div>
              <div className="text-[10px] tabular-nums font-bold text-[var(--muted)]">
                {totalProgress}%
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--muted)] uppercase tracking-wider">
              <span>{nodes.length} {l.tree.nodes}</span>
              {dueCount > 0 && (
                <span className="text-yellow-500 font-semibold">
                  <Clock className="inline h-3 w-3 mr-0.5" />
                  {dueCount} {l.tree.due}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1"
              aria-label="edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={onDeleteSubject}
              className="text-[var(--muted)] hover:text-red-500 transition-colors p-1"
              aria-label="delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-1.5">
        {roots.length === 0 && (
          <Card className="text-center py-8">
            <BookOpen className="h-8 w-8 mx-auto text-[var(--muted)] mb-2" />
            <div className="text-sm font-semibold">{l.tree.emptyNodesTitle}</div>
            <div className="text-xs text-[var(--muted)] mt-1">{l.tree.emptyNodesHint}</div>
          </Card>
        )}
        {roots.map((n) => (
          <NodeRow
            key={n.id}
            node={n}
            depth={0}
            byParent={byParent}
            expanded={expanded}
            onToggle={toggle}
            onOpen={onOpenNode}
            onAddChild={(parent) => setCreating({ parent })}
          />
        ))}

        <button
          onClick={() => setCreating({ parent: null })}
          className="self-start rounded-xl border border-dashed border-[var(--card-border)] px-3 py-2 mt-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)] transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          {l.tree.newRootNode}
        </button>
      </div>

      <CreateNodeDialog
        open={!!creating}
        parent={creating?.parent ?? null}
        subjectId={subject.id}
        onClose={() => setCreating(null)}
        onCreated={async (newNode) => {
          setCreating(null);
          if (newNode.parent_id !== null) {
            setExpanded((prev) => new Set(prev).add(newNode.parent_id!));
          }
          await onRefresh();
        }}
      />

      <EditSubjectDialog
        open={editing}
        subject={subject}
        onClose={() => setEditing(false)}
        onSaved={async () => {
          setEditing(false);
          await onRefreshSubject();
        }}
      />
    </div>
  );
}

function NodeRow({
  node,
  depth,
  byParent,
  expanded,
  onToggle,
  onOpen,
  onAddChild,
}: {
  node: LearnNode;
  depth: number;
  byParent: Map<number | null, LearnNode[]>;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onOpen: (n: LearnNode) => void;
  onAddChild: (parent: LearnNode) => void;
}) {
  const { t } = useLang();
  const l = t.dash.learn;
  const children = byParent.get(node.id) ?? [];
  const isOpen = expanded.has(node.id);
  const due = isDue(node);

  return (
    <div className="flex flex-col">
      <div
        className="flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)] hover:bg-[var(--surface-2)] transition-all shadow-soft"
        style={{ marginLeft: `${depth * 16}px` }}
      >
        <button
          onClick={() => children.length && onToggle(node.id)}
          aria-label="expand"
          className="shrink-0 w-7 h-9 flex items-center justify-center text-[var(--muted)]"
          disabled={children.length === 0}
        >
          {children.length > 0 ? (
            isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
          ) : (
            <span className="block w-1.5 h-1.5 rounded-full bg-[var(--card-border)]" />
          )}
        </button>
        <button
          onClick={() => onOpen(node)}
          className="flex-1 min-w-0 flex items-center gap-2 py-2 pr-2 text-left cursor-pointer"
        >
          <span className="text-sm font-medium truncate flex-1">{node.title}</span>
          {due && (
            <Badge variant="warning" className="text-[10px]">
              {l.tree.dueShort}
            </Badge>
          )}
          <Badge variant={STATUS_VARIANT[node.status]} className="text-[10px] hidden sm:inline-flex">
            {l.statuses[node.status]}
          </Badge>
          <span className="text-[10px] tabular-nums font-bold text-[var(--muted)] w-9 text-right">
            {node.mastery_percent}%
          </span>
        </button>
        <button
          onClick={() => onAddChild(node)}
          aria-label="add child"
          className="shrink-0 w-8 h-9 flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {isOpen && children.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-1.5">
          {children.map((c) => (
            <NodeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              byParent={byParent}
              expanded={expanded}
              onToggle={onToggle}
              onOpen={onOpen}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateNodeDialog({
  open,
  parent,
  subjectId,
  onClose,
  onCreated,
}: {
  open: boolean;
  parent: LearnNode | null;
  subjectId: number;
  onClose: () => void;
  onCreated: (n: LearnNode) => void;
}) {
  const { t } = useLang();
  const l = t.dash.learn;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
    }
  }, [open]);

  const submit = async () => {
    if (!title.trim()) return;
    const n = await learnApi.createNode({
      subject_id: subjectId,
      parent_id: parent?.id ?? null,
      title: title.trim(),
      description: description.trim() || undefined,
    });
    onCreated(n);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>
            {parent ? `${l.tree.newChild}: ${parent.title}` : l.tree.newRootNode}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={l.tree.nodeTitlePh}
            autoFocus
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={l.tree.nodeDescPh}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {l.cancel}
          </Button>
          <Button onClick={submit} disabled={!title.trim()}>
            {l.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NodeDetailSheet({
  node,
  onClose,
  onUpdated,
}: {
  node: LearnNode | null;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const { t } = useLang();
  const l = t.dash.learn;
  const [sessions, setSessions] = useState<LearnSession[]>([]);
  const [recallOpen, setRecallOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!node) return;
    setEditTitle(node.title);
    setEditDesc(node.description ?? "");
    setDirty(false);
    learnApi.listSessions(node.id).then((rows) => {
      setSessions(Array.isArray(rows) ? rows : []);
    });
  }, [node]);

  const saveEdits = async () => {
    if (!node || !dirty) return;
    await learnApi.updateNode(node.id, {
      title: editTitle.trim() || node.title,
      description: editDesc,
    });
    setDirty(false);
    await onUpdated();
  };

  const remove = async () => {
    if (!node) return;
    if (!confirm(l.tree.confirmDeleteNode)) return;
    await learnApi.deleteNode(node.id);
    onClose();
    await onUpdated();
  };

  const submitRecall = async (score: number) => {
    if (!node) return;
    await learnApi.createSession({ node_id: node.id, recall_score: score });
    setRecallOpen(false);
    const rows = await learnApi.listSessions(node.id);
    setSessions(Array.isArray(rows) ? rows : []);
    await onUpdated();
  };

  return (
    <>
      <Sheet open={!!node} onOpenChange={(v) => !v && onClose()} side="right">
        {node && (
          <div className="flex flex-col gap-5 p-5 pt-12">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] mb-1">
                {l.tree.nodeDetails}
              </div>
              <Input
                value={editTitle}
                onChange={(e) => {
                  setEditTitle(e.target.value);
                  setDirty(true);
                }}
                onBlur={saveEdits}
                className="text-base font-bold"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant={STATUS_VARIANT[node.status]}>{l.statuses[node.status]}</Badge>
              <Badge variant="outline">
                <Clock className="h-3 w-3 mr-1 inline" />
                {l.tree.next}: {fmtDate(node.next_review)}
              </Badge>
              <Badge variant="outline">{node.mastery_percent}% {l.tree.mastery}</Badge>
            </div>

            <Progress value={node.mastery_percent} />

            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] mb-1.5">
                {l.tree.description}
              </div>
              <Textarea
                value={editDesc}
                onChange={(e) => {
                  setEditDesc(e.target.value);
                  setDirty(true);
                }}
                onBlur={saveEdits}
                placeholder={l.tree.nodeDescPh}
                rows={4}
              />
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <Button onClick={() => setRecallOpen(true)} className="flex-1">
                {l.tree.testMyself}
              </Button>
              <Button variant="outline" onClick={remove} aria-label="delete">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] mb-2">
                {l.tree.history} ({sessions.length})
              </div>
              {sessions.length === 0 ? (
                <div className="text-xs text-[var(--muted)] py-2">{l.tree.noHistory}</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {sessions.slice(0, 20).map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-[var(--surface-2)]"
                    >
                      <span className="text-[var(--muted)]">
                        {new Date(s.created_at).toLocaleString("ru-RU", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <Badge variant={s.recall_score >= 4 ? "success" : s.recall_score >= 2 ? "warning" : "danger"}>
                        {l.tree.score} {s.recall_score}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Sheet>

      <RecallDialog open={recallOpen} onClose={() => setRecallOpen(false)} onSubmit={submitRecall} />
    </>
  );
}

function RecallDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (score: number) => void;
}) {
  const { t } = useLang();
  const l = t.dash.learn;
  const labels = [
    { score: 1, label: l.tree.score1, desc: l.tree.score1Desc, color: "bg-red-500/15 text-red-500 border-red-500/25" },
    { score: 2, label: l.tree.score2, desc: l.tree.score2Desc, color: "bg-orange-500/15 text-orange-500 border-orange-500/25" },
    { score: 3, label: l.tree.score3, desc: l.tree.score3Desc, color: "bg-yellow-500/15 text-yellow-500 border-yellow-500/25" },
    { score: 4, label: l.tree.score4, desc: l.tree.score4Desc, color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25" },
    { score: 5, label: l.tree.score5, desc: l.tree.score5Desc, color: "bg-emerald-600/15 text-emerald-600 border-emerald-600/25" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{l.tree.recallTitle}</DialogTitle>
          <p className="text-xs text-[var(--muted)] mt-1">{l.tree.recallHint}</p>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {labels.map((opt) => (
            <button
              key={opt.score}
              onClick={() => onSubmit(opt.score)}
              className={`text-left rounded-xl border ${opt.color} px-4 py-3 hover:scale-[1.01] transition-transform cursor-pointer`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg font-black tabular-nums">{opt.score}</span>
                <span className="text-sm font-bold">{opt.label}</span>
              </div>
              <div className="text-xs opacity-80 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditSubjectDialog({
  open,
  subject,
  onClose,
  onSaved,
}: {
  open: boolean;
  subject: LearnSubject;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const l = t.dash.learn;
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("📘");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(subject.title);
      setEmoji(subject.emoji ?? "📘");
      setDescription(subject.description ?? "");
    }
  }, [open, subject]);

  const submit = async () => {
    if (!title.trim()) return;
    await learnApi.updateSubject(subject.id, {
      title: title.trim(),
      emoji,
      description,
    });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{subject.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={2}
              className="w-16 text-center text-xl"
              placeholder="📘"
            />
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={l.tree.subjectTitlePh}
              autoFocus
            />
          </div>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={l.tree.subjectDescPh}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {l.cancel}
          </Button>
          <Button onClick={submit} disabled={!title.trim()}>
            {l.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
