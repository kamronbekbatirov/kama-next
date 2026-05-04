"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X, Wallet, ArrowUpRight, ArrowDownRight, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/providers";
import { api, jPost, jPatch, jDel, type BudgetEntry, type Subscription } from "./_shared";
import { SectionHeader, Pill, IconButton, EmptyState, Chip, SoftCard } from "./dashboard-ui";

export function BudgetTab() {
  const { t } = useLang();
  const d = t.dash.budget;
  const [entries, setEntries]               = useState<BudgetEntry[]>([]);
  const [initialBalance, setInitialBalanceState] = useState<number>(0);
  const [subs, setSubs]                     = useState<Subscription[]>([]);
  const [adding, setAdding]                 = useState(false);
  const [addingSub, setAddingSub]           = useState(false);
  const [editSubs, setEditSubs]             = useState(false);
  const [editBalance, setEditBalance]       = useState(false);
  const [editingEntry, setEditingEntry]     = useState<BudgetEntry | null>(null);
  const [editingSub, setEditingSub]         = useState<Subscription | null>(null);
  const [form, setForm]                     = useState({ type: "expense" as "income" | "expense", amount: "", category: "", description: "" });
  const [subForm, setSubForm]               = useState({ name: "", amount: "", currency: "$", day: "" });

  const load = useCallback(async () => {
    const data = await api("/api/dashboard/budget");
    if (Array.isArray(data)) setEntries(data);
  }, []);
  useEffect(() => {
    load();
    api("/api/dashboard/settings?key=initial_balance").then((r: { value: number | null }) => {
      if (r && typeof r.value === "number") setInitialBalanceState(r.value);
    });
    api("/api/dashboard/subscriptions").then((rows: Subscription[] | { error: string }) => {
      if (Array.isArray(rows)) setSubs(rows);
    });
  }, [load]);

  const setInitialBalance = (v: number) => {
    setInitialBalanceState(v);
    jPost("/api/dashboard/settings", { key: "initial_balance", value: v });
  };
  const toggleSubActive = async (id: string) => {
    const sub = subs.find(s => s.id === id);
    if (!sub) return;
    const next = !sub.active;
    setSubs(subs.map(s => s.id === id ? { ...s, active: next } : s));
    await jPatch("/api/dashboard/subscriptions", { id, active: next });
  };

  const activeSubs   = subs.filter(s => s.active);
  const subMonthly   = activeSubs.reduce((s, sub) => s + sub.amount, 0);
  const entrySpend   = entries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
  const balance      = initialBalance + entries.reduce((s, e) => e.type === "income" ? s + Number(e.amount) : s - Number(e.amount), 0);
  const totalMonthly = entrySpend + subMonthly;
  const runway       = totalMonthly > 0 ? Math.floor(balance / (totalMonthly / 30)) : null;

  const addSub = async () => {
    const amt = parseFloat(subForm.amount);
    const day = parseInt(subForm.day);
    if (!subForm.name.trim() || isNaN(amt) || amt <= 0) return;
    const created = await jPost("/api/dashboard/subscriptions", {
      name: subForm.name.trim(),
      amount: amt,
      currency: subForm.currency,
      day: isNaN(day) ? 1 : Math.max(1, Math.min(31, day)),
    }) as Subscription;
    if (created && created.id) setSubs([created, ...subs]);
    setSubForm({ name: "", amount: "", currency: "$", day: "" });
    setAddingSub(false);
  };

  return (
    <div className="flex flex-col gap-4 pt-2 animate-fade-in">

      {/* Hero balance card */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] font-medium">
            {d.balance}
          </div>
          {runway !== null && (
            <Chip tone={runway < 30 ? "danger" : runway < 90 ? "warning" : "success"}>
              {runway}d {d.runway}
            </Chip>
          )}
        </div>
        <div className={[
          "text-4xl font-bold tabular-nums tracking-tight",
          balance < 0 ? "text-red-500" : "",
        ].join(" ")}>
          ${Math.abs(balance).toLocaleString()}
          {balance < 0 && <span className="text-xl text-red-500 align-top ml-1">−</span>}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-[var(--card-border)]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] font-medium">{d.spent}</div>
            <div className="text-xl font-semibold tabular-nums mt-0.5">${totalMonthly.toLocaleString()}<span className="text-xs text-[var(--muted)]">/mo</span></div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] font-medium">{d.subTotal}</div>
            <div className="text-xl font-semibold tabular-nums mt-0.5">${subMonthly.toLocaleString()}<span className="text-xs text-[var(--muted)]">/mo</span></div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          {editBalance ? (
            <>
              <Input
                type="number"
                value={initialBalance || ""}
                onChange={e => setInitialBalance(parseFloat(e.target.value) || 0)}
                placeholder={d.initialBalance}
                className="h-8 text-xs tabular-nums"
                autoFocus
              />
              <button
                onClick={() => setEditBalance(false)}
                className="h-8 px-3 rounded-lg bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold hover:opacity-85 transition-opacity shrink-0"
              >
                OK
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditBalance(true)}
              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1.5"
            >
              <Pencil className="h-3 w-3" />
              {d.initialBalance}: <span className="tabular-nums">${initialBalance.toLocaleString()}</span>
            </button>
          )}
        </div>
      </Card>

      {/* Add entry button */}
      <button
        onClick={() => setAdding(v => !v)}
        className={[
          "w-full h-11 rounded-2xl border-2 border-dashed transition-all flex items-center justify-center gap-2 text-sm font-semibold cursor-pointer",
          adding
            ? "border-[var(--foreground)] bg-[var(--foreground)]/5 text-[var(--foreground)]"
            : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--foreground)]/40 hover:text-[var(--foreground)]",
        ].join(" ")}
      >
        <Plus className={["h-4 w-4 transition-transform", adding ? "rotate-45" : ""].join(" ")} />
        {d.addEntry}
      </button>

      {adding && (
        <Card className="p-4 space-y-3 animate-fade-in">
          <div className="grid grid-cols-2 gap-2">
            {(["expense", "income"] as const).map(tp => (
              <button
                key={tp}
                onClick={() => setForm(p => ({ ...p, type: tp }))}
                className={[
                  "h-10 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2",
                  form.type === tp
                    ? tp === "income"
                      ? "bg-emerald-500 text-white"
                      : "bg-[var(--foreground)] text-[var(--background)]"
                    : "border border-[var(--card-border)] text-[var(--muted)]",
                ].join(" ")}
              >
                {tp === "income" ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {tp === "income" ? d.income : d.expense}
              </button>
            ))}
          </div>
          <Input
            type="number"
            inputMode="decimal"
            value={form.amount}
            onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
            placeholder={d.amount}
            autoFocus
            className="text-base font-semibold tabular-nums"
          />
          <Input
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder={d.description}
          />
          <Input
            value={form.category}
            onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
            placeholder={d.category}
          />
          <button
            onClick={async () => {
              setAdding(false);
              await jPost("/api/dashboard/budget", { ...form, amount: parseFloat(form.amount) });
              setForm({ type: "expense", amount: "", category: "", description: "" });
              load();
            }}
            disabled={!form.amount}
            className="w-full h-10 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-sm font-semibold hover:opacity-85 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {d.add}
          </button>
        </Card>
      )}

      {/* Subscriptions */}
      <section>
        <SectionHeader
          eyebrow={d.subs}
          trailing={
            <>
              <span className="text-xs tabular-nums font-semibold text-[var(--muted)]">
                ${subMonthly.toLocaleString()}/mo
              </span>
              <Pill size="sm" active={editSubs} onClick={() => { setEditSubs(v => !v); setAddingSub(false); }}>
                <Pencil className="h-3 w-3" />
                {editSubs ? d.subDone : d.subEdit}
              </Pill>
            </>
          }
        />

        {editSubs && (
          <div className="mb-2.5">
            {addingSub ? (
              <Card className="p-3 space-y-2.5 animate-fade-in">
                <div className="flex gap-2">
                  <div className="flex gap-1 rounded-lg border border-[var(--card-border)] p-0.5">
                    {["$", "£", "€"].map(c => (
                      <button
                        key={c}
                        onClick={() => setSubForm(p => ({ ...p, currency: c }))}
                        className={[
                          "h-7 w-7 rounded-md text-xs font-semibold transition-all",
                          subForm.currency === c
                            ? "bg-[var(--foreground)] text-[var(--background)]"
                            : "text-[var(--muted)]",
                        ].join(" ")}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <Input
                    value={subForm.name}
                    onChange={e => setSubForm(p => ({ ...p, name: e.target.value }))}
                    placeholder={d.subName}
                    className="h-9"
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={subForm.amount}
                    onChange={e => setSubForm(p => ({ ...p, amount: e.target.value }))}
                    placeholder={d.subAmount}
                    className="h-9 tabular-nums"
                  />
                  <Input
                    type="number"
                    value={subForm.day}
                    onChange={e => setSubForm(p => ({ ...p, day: e.target.value }))}
                    placeholder={d.subDay}
                    className="h-9 tabular-nums w-24"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addSub}
                    className="flex-1 h-9 rounded-xl bg-[var(--foreground)] text-[var(--background)] text-xs font-semibold hover:opacity-85 transition-opacity"
                  >
                    {d.addSub}
                  </button>
                  <IconButton size="md" variant="outline" onClick={() => setAddingSub(false)}>
                    <X className="h-4 w-4" />
                  </IconButton>
                </div>
              </Card>
            ) : (
              <button
                onClick={() => setAddingSub(true)}
                className="w-full h-9 rounded-xl border-2 border-dashed border-[var(--card-border)] text-xs text-[var(--muted)] hover:border-[var(--foreground)]/40 hover:text-[var(--foreground)] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                {d.addSub}
              </button>
            )}
          </div>
        )}

        {subs.length === 0 ? (
          <SoftCard className="p-4">
            <EmptyState title={d.noSubs} />
          </SoftCard>
        ) : (
          <Card className="p-2">
            <div className="flex flex-col">
              {subs.map((sub, idx) => (
                <div
                  key={sub.id}
                  className={[
                    "flex items-center gap-3 py-2.5 px-2 rounded-xl",
                    idx > 0 ? "border-t border-[var(--card-border)]" : "",
                  ].join(" ")}
                >
                  <button
                    onClick={() => toggleSubActive(sub.id)}
                    aria-label={sub.active ? "pause" : "resume"}
                    className={[
                      "w-9 h-5 rounded-full p-0.5 transition-all shrink-0",
                      sub.active ? "bg-[var(--foreground)]" : "bg-[var(--card-border)]",
                    ].join(" ")}
                  >
                    <div className={[
                      "w-4 h-4 rounded-full bg-[var(--background)] transition-transform",
                      sub.active ? "translate-x-4" : "translate-x-0",
                    ].join(" ")} />
                  </button>
                  <button
                    onClick={() => setEditingSub(sub)}
                    className={[
                      "flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer hover:bg-[var(--surface-2)] -mx-1 px-1 py-1 rounded-lg transition-colors",
                      !sub.active ? "opacity-50" : "",
                    ].join(" ")}
                    aria-label="edit"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{sub.name}</div>
                      <div className="text-[11px] text-[var(--muted)]">{sub.day} число каждого месяца</div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums shrink-0">
                      {sub.currency}{sub.amount.toLocaleString()}
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </section>

      {/* Entries */}
      <section>
        <SectionHeader
          eyebrow={d.spent}
          trailing={<span className="text-xs tabular-nums text-[var(--muted)]">{entries.length}</span>}
        />
        {entries.length === 0 ? (
          <SoftCard>
            <EmptyState icon={<Wallet className="h-8 w-8" />} title={d.noEntries} />
          </SoftCard>
        ) : (
          <Card className="p-2">
            <div className="flex flex-col">
              {entries.map((e, idx) => (
                <button
                  key={e.id}
                  onClick={() => setEditingEntry(e)}
                  className={[
                    "flex items-center gap-3 py-2.5 px-2 rounded-xl transition-colors hover:bg-[var(--surface-2)] text-left cursor-pointer",
                    idx > 0 ? "border-t border-[var(--card-border)]" : "",
                  ].join(" ")}
                  aria-label="edit"
                >
                  <div className={[
                    "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                    e.type === "income" ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500",
                  ].join(" ")}>
                    {e.type === "income" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{e.description || e.category || "—"}</div>
                    <div className="text-[11px] text-[var(--muted)] tabular-nums">{e.date}</div>
                  </div>
                  <div className={[
                    "text-sm font-semibold tabular-nums shrink-0",
                    e.type === "income" ? "text-emerald-500" : "",
                  ].join(" ")}>
                    {e.type === "income" ? "+" : "−"}${Number(e.amount).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}
      </section>

      <EditEntryDialog
        entry={editingEntry}
        labels={{ income: d.income, expense: d.expense, amount: d.amount, description: d.description, category: d.category, save: t.dash.jobs.save, cancel: t.dash.jobs.cancel }}
        onClose={() => setEditingEntry(null)}
        onSaved={async () => { setEditingEntry(null); await load(); }}
        onDeleted={async () => { setEditingEntry(null); await load(); }}
      />

      <EditSubDialog
        sub={editingSub}
        labels={{ name: d.subName, amount: d.subAmount, day: d.subDay, save: t.dash.jobs.save, cancel: t.dash.jobs.cancel }}
        onClose={() => setEditingSub(null)}
        onSaved={async (next) => {
          setEditingSub(null);
          if (next) setSubs(subs.map(s => s.id === next.id ? next : s));
        }}
        onDeleted={async (id) => {
          setEditingSub(null);
          setSubs(subs.filter(s => s.id !== id));
        }}
      />
    </div>
  );
}

function EditEntryDialog({
  entry, labels, onClose, onSaved, onDeleted,
}: {
  entry: BudgetEntry | null;
  labels: { income: string; expense: string; amount: string; description: string; category: string; save: string; cancel: string };
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");

  useEffect(() => {
    if (entry) {
      setType(entry.type);
      setAmount(String(entry.amount));
      setDescription(entry.description ?? "");
      setCategory(entry.category ?? "");
    }
  }, [entry]);

  if (!entry) return null;

  const save = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;
    await jPatch("/api/dashboard/budget", {
      id: entry.id, type, amount: amt, description, category,
    });
    onSaved();
  };
  const remove = async () => {
    await jDel("/api/dashboard/budget", { id: entry.id });
    onDeleted();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{description || category || "Entry"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {(["expense", "income"] as const).map(tp => (
              <button
                key={tp}
                onClick={() => setType(tp)}
                className={[
                  "h-10 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2",
                  type === tp
                    ? tp === "income"
                      ? "bg-emerald-500 text-white"
                      : "bg-[var(--foreground)] text-[var(--background)]"
                    : "border border-[var(--card-border)] text-[var(--muted)]",
                ].join(" ")}
              >
                {tp === "income" ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {tp === "income" ? labels.income : labels.expense}
              </button>
            ))}
          </div>
          <Input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder={labels.amount}
            className="text-base font-semibold tabular-nums"
          />
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={labels.description} />
          <Input value={category} onChange={e => setCategory(e.target.value)} placeholder={labels.category} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={remove} className="mr-auto">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={onClose}>{labels.cancel}</Button>
          <Button onClick={save} disabled={!amount}>{labels.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSubDialog({
  sub, labels, onClose, onSaved, onDeleted,
}: {
  sub: Subscription | null;
  labels: { name: string; amount: string; day: string; save: string; cancel: string };
  onClose: () => void;
  onSaved: (next: Subscription | null) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("$");
  const [day, setDay] = useState("1");

  useEffect(() => {
    if (sub) {
      setName(sub.name);
      setAmount(String(sub.amount));
      setCurrency(sub.currency);
      setDay(String(sub.day));
    }
  }, [sub]);

  if (!sub) return null;

  const save = async () => {
    const amt = parseFloat(amount);
    const dy = parseInt(day);
    if (!name.trim() || isNaN(amt) || amt <= 0) return;
    await jPatch("/api/dashboard/subscriptions", {
      id: sub.id, name: name.trim(), amount: amt, currency,
      day: isNaN(dy) ? 1 : Math.max(1, Math.min(31, dy)),
    });
    onSaved({ ...sub, name: name.trim(), amount: amt, currency, day: isNaN(dy) ? 1 : Math.max(1, Math.min(31, dy)) });
  };
  const remove = async () => {
    await jDel("/api/dashboard/subscriptions", { id: sub.id });
    onDeleted(sub.id);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{sub.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex gap-1 rounded-lg border border-[var(--card-border)] p-0.5">
              {["$", "£", "€"].map(c => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={[
                    "h-7 w-7 rounded-md text-xs font-semibold transition-all",
                    currency === c
                      ? "bg-[var(--foreground)] text-[var(--background)]"
                      : "text-[var(--muted)]",
                  ].join(" ")}
                >
                  {c}
                </button>
              ))}
            </div>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={labels.name} />
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={labels.amount}
              className="tabular-nums"
            />
            <Input
              type="number"
              value={day}
              onChange={e => setDay(e.target.value)}
              placeholder={labels.day}
              className="tabular-nums w-24"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={remove} className="mr-auto">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={onClose}>{labels.cancel}</Button>
          <Button onClick={save} disabled={!name.trim() || !amount}>{labels.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
