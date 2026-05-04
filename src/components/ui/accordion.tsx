"use client";

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

type AccordionType = "single" | "multiple";

interface AccordionCtx {
  type: AccordionType;
  open: Set<string>;
  toggle: (v: string) => void;
}
const Ctx = createContext<AccordionCtx | null>(null);

export function Accordion({
  type = "multiple",
  defaultValue,
  className,
  children,
}: {
  type?: AccordionType;
  defaultValue?: string[];
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set(defaultValue ?? []));
  const toggle = (v: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else {
        if (type === "single") next.clear();
        next.add(v);
      }
      return next;
    });
  };
  return (
    <Ctx.Provider value={{ type, open, toggle }}>
      <div className={cn("flex flex-col gap-1", className)}>{children}</div>
    </Ctx.Provider>
  );
}

interface ItemCtx {
  value: string;
  isOpen: boolean;
}
const ItemContext = createContext<ItemCtx | null>(null);

export function AccordionItem({
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
  const isOpen = ctx.open.has(value);
  return (
    <ItemContext.Provider value={{ value, isOpen }}>
      <div className={cn("rounded-xl border border-[var(--card-border)] bg-[var(--surface)]", className)}>
        {children}
      </div>
    </ItemContext.Provider>
  );
}

export function AccordionTrigger({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ctx = useContext(Ctx);
  const item = useContext(ItemContext);
  if (!ctx || !item) return null;
  return (
    <button
      type="button"
      onClick={() => ctx.toggle(item.value)}
      aria-expanded={item.isOpen}
      className={cn(
        "w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium transition-all rounded-xl",
        "hover:bg-[var(--muted-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        className,
      )}
    >
      <span className="flex-1 min-w-0">{children}</span>
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 text-[var(--muted)] transition-transform",
          item.isOpen && "rotate-180",
        )}
      />
    </button>
  );
}

export function AccordionContent({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const item = useContext(ItemContext);
  if (!item) return null;
  if (!item.isOpen) return null;
  return (
    <div className={cn("px-4 pb-4 pt-1 text-sm animate-fade-in", className)}>{children}</div>
  );
}
