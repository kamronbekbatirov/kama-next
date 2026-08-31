"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useLang } from "@/components/providers";
import { SectionHeader, EmptyState } from "../dashboard-ui";
import { haptic, tgConfirm, useTelegramBack } from "@/lib/telegram-webapp";
import { foodApi } from "./api";
import type { Dish } from "./types";

/** The recipe book: what you can cook, what it costs you, and what it is made of. */
export function FoodBook({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const { t } = useLang();
  const f = t.dash.food;
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState<Dish | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    foodApi.dishes().then(d => { if (Array.isArray(d)) setDishes(d); }).catch(() => {});
  }, []);
  useEffect(load, [load, reloadKey]);

  const toShopping = async (d: Dish) => {
    const r = await foodApi.shopFromDish(d.id);
    if ("added" in r) haptic.success();
    onChanged();
  };

  const remove = async (d: Dish) => {
    if (!(await tgConfirm(f.deleteDishConfirm.replace("{name}", d.name)))) return;
    await foodApi.deleteDish(d.id);
    load(); onChanged();
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        eyebrow={f.tabs.book}
        trailing={
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> {f.newDish}
          </button>
        }
      />

      {dishes.length === 0 ? (
        <Card><EmptyState title={f.bookEmpty} /></Card>
      ) : (
        <div className="flex flex-col gap-2">
          {dishes.map(d => {
            const isOpen = open === d.id;
            return (
              <Card key={d.id} className="p-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOpen(isOpen ? null : d.id)}
                    className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                  >
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />}
                    <span className="text-sm font-semibold truncate">{d.name}</span>
                  </button>
                  <span className="text-xs tabular-nums text-[var(--muted)] shrink-0">
                    {d.kcal ?? "—"} {f.kcal}
                  </span>
                </div>

                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-[var(--card-border)] flex flex-col gap-3">
                    {d.items.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] mb-1">
                          {f.dishItems}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          {d.items.map(i => (
                            <div key={i.id} className="flex items-baseline gap-2 text-xs">
                              <span className="flex-1 min-w-0 truncate">{i.name}</span>
                              <span className="text-[var(--muted)] tabular-nums shrink-0">{i.qty ?? ""}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {d.recipe && (
                      <div className="text-[11px] leading-relaxed text-[var(--muted)] whitespace-pre-wrap">
                        {d.recipe}
                      </div>
                    )}

                    <div className="flex items-center gap-4">
                      {d.items.length > 0 && (
                        <button onClick={() => void toShopping(d)}
                          className="inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer">
                          <ShoppingCart className="h-3.5 w-3.5" /> {f.toShopping}
                        </button>
                      )}
                      <button onClick={() => setEditing(d)}
                        className="inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer">
                        <Pencil className="h-3.5 w-3.5" /> {f.editDish}
                      </button>
                      <button onClick={() => void remove(d)}
                        className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)] hover:text-red-500 transition-colors cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" /> {f.deleteDish}
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <DishForm
          dish={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); onChanged(); }}
        />
      )}
    </div>
  );
}

function DishForm({ dish, onClose, onSaved }: {
  dish: Dish | null; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useLang();
  const f = t.dash.food;
  const [name, setName] = useState(dish?.name ?? "");
  const [kcal, setKcal] = useState(dish?.kcal != null ? String(dish.kcal) : "");
  const [servings, setServings] = useState(String(dish?.servings ?? 1));
  const [recipe, setRecipe] = useState(dish?.recipe ?? "");
  const [items, setItems] = useState<{ name: string; qty: string }[]>(
    dish?.items.map(i => ({ name: i.name, qty: i.qty ?? "" })) ?? [{ name: "", qty: "" }],
  );
  const [busy, setBusy] = useState(false);

  useTelegramBack(true, onClose);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    await foodApi.saveDish({
      name: name.trim(),
      kcal: kcal.trim() ? Math.round(Number(kcal)) : null,
      servings: Number(servings) || 1,
      recipe: recipe.trim() || null,
      items: items.filter(i => i.name.trim()).map(i => ({ name: i.name.trim(), qty: i.qty.trim() || null })),
    }, dish?.id);
    setBusy(false);
    haptic.success();
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClose={onClose} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dish ? f.editDish : f.newDish}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder={f.dishName} />
          <div className="flex items-center gap-2">
            <Input type="number" inputMode="numeric" value={kcal} onChange={e => setKcal(e.target.value)}
                   placeholder={f.dishKcal} className="flex-1 tabular-nums" />
            <Input type="number" inputMode="numeric" value={servings} onChange={e => setServings(e.target.value)}
                   placeholder={f.dishServings} className="w-24 tabular-nums" />
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] mb-1.5">{f.dishItems}</div>
            <div className="flex flex-col gap-1.5">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={it.name} placeholder={f.itemName} className="flex-1 min-w-0 h-9 text-sm"
                         onChange={e => setItems(p => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  <Input value={it.qty} placeholder={f.itemQty} className="w-24 h-9 text-sm"
                         onChange={e => setItems(p => p.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
                  <button onClick={() => setItems(p => p.filter((_, j) => j !== i))}
                          aria-label="remove"
                          className="shrink-0 p-1 -m-1 text-[var(--muted)] hover:text-red-500 cursor-pointer">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setItems(p => [...p, { name: "", qty: "" }])}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer">
              <Plus className="h-3 w-3" /> {f.addItem}
            </button>
          </div>

          <Textarea value={recipe} onChange={e => setRecipe(e.target.value)} rows={4} placeholder={f.dishRecipe} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{f.cancel}</Button>
          <Button onClick={() => void save()} disabled={!name.trim() || busy}>{f.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
