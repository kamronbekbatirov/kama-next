"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLang } from "@/components/providers";
import { SectionHeader, EmptyState } from "../dashboard-ui";
import { haptic } from "@/lib/telegram-webapp";
import { foodApi } from "./api";
import type { ShopItem } from "./types";

/** The list, filled from dishes or by hand, ticked off in the shop. */
export function FoodShopping({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const { t } = useLang();
  const f = t.dash.food;
  const [items, setItems] = useState<ShopItem[]>([]);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");

  const load = useCallback(() => {
    foodApi.shopping().then(r => { if (Array.isArray(r)) setItems(r); }).catch(() => {});
  }, []);
  useEffect(load, [load, reloadKey]);

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    await foodApi.addShopping(n, qty.trim() || undefined);
    setName(""); setQty("");
    load(); onChanged();
  };

  const toggle = async (i: ShopItem) => {
    // Optimistic: ticking things off in a shop should not wait for a network.
    setItems(p => p.map(x => x.id === i.id ? { ...x, checked: !x.checked } : x));
    if (!i.checked) haptic.tap();
    await foodApi.checkShopping(i.id, !i.checked);
    load();
  };

  const checked = items.filter(i => i.checked).length;

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        eyebrow={f.tabs.shop}
        trailing={checked > 0 ? (
          <button onClick={async () => { await foodApi.clearChecked(); load(); onChanged(); }}
            className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer">
            {f.clearChecked}
          </button>
        ) : undefined}
      />

      <Card className="p-3">
        <div className="flex items-center gap-2">
          <Input value={name} onChange={e => setName(e.target.value)}
                 onKeyDown={e => { if (e.key === "Enter") void add(); }}
                 placeholder={f.shopAdd} className="flex-1 min-w-0 h-9 text-sm" />
          <Input value={qty} onChange={e => setQty(e.target.value)}
                 onKeyDown={e => { if (e.key === "Enter") void add(); }}
                 placeholder={f.itemQty} className="w-24 h-9 text-sm" />
          <button onClick={() => void add()} disabled={!name.trim()}
            className="h-9 px-3 shrink-0 rounded-xl bg-[var(--foreground)] text-[var(--background)] disabled:opacity-40 cursor-pointer">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </Card>

      {items.length === 0 ? (
        <Card><EmptyState title={f.shopEmpty} /></Card>
      ) : (
        <Card className="p-2">
          <div className="flex flex-col gap-0.5">
            {items.map(i => (
              <div key={i.id} className="flex items-center gap-3 py-2 px-2">
                <button onClick={() => void toggle(i)} aria-label={i.name}
                  className={[
                    "h-5 w-5 shrink-0 rounded-md border grid place-items-center transition-all cursor-pointer",
                    i.checked
                      ? "bg-[var(--foreground)] border-[var(--foreground)] text-[var(--background)]"
                      : "border-[var(--card-border)] hover:border-[var(--foreground)]/40",
                  ].join(" ")}>
                  {i.checked && <Check className="h-3 w-3" />}
                </button>
                <span className={["text-sm flex-1 min-w-0 truncate", i.checked ? "line-through text-[var(--muted)]" : ""].join(" ")}>
                  {i.name}
                </span>
                <span className="text-[11px] tabular-nums text-[var(--muted)] shrink-0">{i.qty ?? ""}</span>
                <button onClick={async () => { await foodApi.removeShopping(i.id); load(); onChanged(); }}
                  aria-label={f.remove}
                  className="shrink-0 p-1 -m-1 text-[var(--muted)] hover:text-red-500 cursor-pointer">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
