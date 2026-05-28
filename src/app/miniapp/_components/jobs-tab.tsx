"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Briefcase, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/providers";
import { api, jPost, jPatch, jDel, STATUS_TONE, type Application } from "./_shared";
import { SectionHeader, Pill, EmptyState, Chip, SoftCard, CopyButton } from "./dashboard-ui";

export function JobsTab() {
  const { t } = useLang();
  const d = t.dash.jobs;
  const [apps, setApps]     = useState<Application[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm]     = useState({ company: "", role: "", status: "applied", notes: "" });
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<Application | null>(null);

  const load = useCallback(async () => {
    const r = await api("/api/dashboard/applications");
    if (Array.isArray(r)) setApps(r);
  }, []);
  useEffect(() => { load(); }, [load]);

  const STATUSES = Object.keys(d.st) as (keyof typeof d.st)[];
  const filtered = filter === "all" ? apps : apps.filter(a => a.status === filter);
  const counts   = STATUSES.reduce((acc, s) => ({ ...acc, [s]: apps.filter(a => a.status === s).length }), {} as Record<string, number>);
  const total = apps.length;

  return (
    <div className="flex flex-col gap-4 pt-2 animate-fade-in">

      {/* Pipeline overview */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] font-medium">{d.pipeline}</div>
            <div className="text-3xl font-bold tabular-nums tracking-tight mt-0.5">{total}</div>
          </div>
          <div className="flex items-center gap-2">
            <CopyButton
              disabled={total === 0}
              getText={() =>
                apps
                  .map((a, i) => `${i + 1}. ${a.company} — ${a.role} [${d.st[a.status as keyof typeof d.st] ?? a.status}]${a.notes ? `\n   ${a.notes.replace(/\n/g, "\n   ")}` : ""}`)
                  .join("\n")
              }
              aria-label={d.copyAll}
              title={d.copyAll}
            />
            <Pill size="sm" active={filter === "all"} onClick={() => setFilter("all")}>
              {d.all}
            </Pill>
            <button
              onClick={() => setAdding(v => !v)}
              aria-label="add"
              className={[
                "h-9 w-9 rounded-full flex items-center justify-center cursor-pointer transition-all shrink-0",
                "bg-[var(--foreground)] text-[var(--background)] hover:opacity-85",
                adding ? "rotate-45" : "",
              ].join(" ")}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {total > 0 ? (
          <div className="space-y-2.5">
            {STATUSES.map(s => {
              const c = counts[s];
              const pct = total > 0 ? Math.round((c / total) * 100) : 0;
              return (
                <button
                  key={s}
                  onClick={() => setFilter(f => f === s ? "all" : s)}
                  className={[
                    "w-full text-left group transition-all cursor-pointer",
                    filter === s ? "" : "opacity-80 hover:opacity-100",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Chip tone={STATUS_TONE[s] === "outline" ? "muted" : (STATUS_TONE[s] as "success"|"warning"|"danger"|"info")}>
                        {d.st[s]}
                      </Chip>
                      {filter === s && <span className="text-[10px] text-[var(--muted)]">{d.filtering}</span>}
                    </div>
                    <div className="text-xs tabular-nums font-semibold">{c}</div>
                  </div>
                  <Progress
                    value={pct}
                    barClassName={
                      s === "offer"     ? "bg-emerald-500" :
                      s === "rejected"  ? "bg-red-500"     :
                      s === "interview" ? "bg-yellow-500"  :
                      s === "screening" ? "bg-blue-500"    :
                      "bg-[var(--foreground)]"
                    }
                  />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-[var(--muted)] text-center py-3">No applications yet</div>
        )}
      </Card>

      {/* Add form */}
      {adding && (
        <Card className="p-4 space-y-3 animate-fade-in">
          <Input
            value={form.company}
            onChange={e => setForm(p => ({ ...p, company: e.target.value }))}
            placeholder={d.company}
            autoFocus
          />
          <Input
            value={form.role}
            onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
            placeholder={d.role}
          />
          <Textarea
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder={d.notes}
            rows={2}
          />
          <div className="flex gap-1.5 flex-wrap">
            {STATUSES.map(s => (
              <Pill key={s} size="sm" active={form.status === s} onClick={() => setForm(p => ({ ...p, status: s }))}>
                {d.st[s]}
              </Pill>
            ))}
          </div>
          <button
            onClick={async () => {
              setAdding(false);
              await jPost("/api/dashboard/applications", form);
              setForm({ company: "", role: "", status: "applied", notes: "" });
              load();
            }}
            disabled={!form.company.trim()}
            className="w-full h-10 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-sm font-semibold hover:opacity-85 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            {d.addApp}
          </button>
        </Card>
      )}

      {/* Application list */}
      <section>
        <SectionHeader
          eyebrow={filter === "all" ? d.all : d.st[filter as keyof typeof d.st]}
          title={undefined}
          trailing={<span className="text-xs tabular-nums text-[var(--muted)]">{filtered.length}</span>}
        />
        {filtered.length === 0 ? (
          <SoftCard>
            <EmptyState icon={<Briefcase className="h-8 w-8" />} title={d.noApps} />
          </SoftCard>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(a => (
              <button
                key={a.id}
                onClick={() => setEditing(a)}
                className="text-left rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-soft hover:shadow-pop hover:border-[var(--foreground)]/20 transition-all cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-sm font-semibold truncate">{a.company}</div>
                      <Chip tone={STATUS_TONE[a.status] === "outline" ? "muted" : (STATUS_TONE[a.status] as "success"|"warning"|"danger"|"info")}>
                        {d.st[a.status as keyof typeof d.st] ?? a.status}
                      </Chip>
                    </div>
                    <div className="text-xs text-[var(--muted)] mt-0.5">{a.role}</div>
                    {a.notes && <div className="text-xs text-[var(--muted)] mt-2 italic line-clamp-2">{a.notes}</div>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <EditApplicationDialog
        app={editing}
        statuses={STATUSES as readonly string[]}
        labels={d.st}
        labelsT={{ company: d.company, role: d.role, notes: d.notes, save: d.save, cancel: d.cancel }}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await load(); }}
        onDeleted={async () => { setEditing(null); await load(); }}
      />
    </div>
  );
}

function EditApplicationDialog({
  app, statuses, labels, labelsT, onClose, onSaved, onDeleted,
}: {
  app: Application | null;
  statuses: readonly string[];
  labels: Record<string, string>;
  labelsT: { company: string; role: string; notes: string; save: string; cancel: string };
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("applied");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (app) {
      setCompany(app.company);
      setRole(app.role);
      setStatus(app.status);
      setNotes(app.notes ?? "");
    }
  }, [app]);

  if (!app) return null;

  const save = async () => {
    if (!company.trim() || !role.trim()) return;
    await jPatch("/api/dashboard/applications", {
      id: app.id, company: company.trim(), role: role.trim(), status, notes,
    });
    onSaved();
  };
  const remove = async () => {
    await jDel("/api/dashboard/applications", { id: app.id });
    onDeleted();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{app.company} · {app.role}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input value={company} onChange={e => setCompany(e.target.value)} placeholder={labelsT.company} />
          <Input value={role} onChange={e => setRole(e.target.value)} placeholder={labelsT.role} />
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={labelsT.notes} rows={2} />
          <div className="flex flex-wrap gap-1.5">
            {statuses.map(s => (
              <Pill key={s} size="sm" active={status === s} onClick={() => setStatus(s)}>
                {labels[s] ?? s}
              </Pill>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={remove} className="mr-auto">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={onClose}>{labelsT.cancel}</Button>
          <Button onClick={save} disabled={!company.trim() || !role.trim()}>{labelsT.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
