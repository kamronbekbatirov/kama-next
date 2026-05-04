"use client";

import { cn } from "@/lib/utils";
import { createContext, useContext, useId, type ReactNode } from "react";

interface TabsCtx {
  value: string;
  setValue: (v: string) => void;
  group: string;
}
const Ctx = createContext<TabsCtx | null>(null);

export function Tabs({
  value,
  onValueChange,
  className,
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
  children: ReactNode;
}) {
  const group = useId();
  return (
    <Ctx.Provider value={{ value, setValue: onValueChange, group }}>
      <div className={cn("flex flex-col gap-3", className)}>{children}</div>
    </Ctx.Provider>
  );
}

export function TabsList({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] bg-[var(--surface)] p-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => ctx.setValue(value)}
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-medium transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        active
          ? "bg-[var(--foreground)] text-[var(--background)] shadow-soft"
          : "text-[var(--muted)] hover:text-[var(--foreground)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const ctx = useContext(Ctx);
  if (!ctx || ctx.value !== value) return null;
  return (
    <div role="tabpanel" className={cn("animate-fade-in", className)}>
      {children}
    </div>
  );
}
