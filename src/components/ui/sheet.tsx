"use client";

import { cn } from "@/lib/utils";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type Side = "right" | "left" | "bottom";

export function Sheet({
  open,
  onOpenChange,
  side = "right",
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  side?: Side;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onOpenChange]);

  if (!open || typeof document === "undefined") return null;

  const sideClasses: Record<Side, string> = {
    right:
      "inset-y-0 right-0 w-full sm:w-[420px] sm:max-w-[90vw] sm:rounded-l-2xl rounded-none border-l border-[var(--card-border)] translate-x-0",
    left:
      "inset-y-0 left-0 w-full sm:w-[420px] sm:max-w-[90vw] sm:rounded-r-2xl rounded-none border-r border-[var(--card-border)] translate-x-0",
    bottom:
      "inset-x-0 bottom-0 max-h-[92vh] rounded-t-2xl border-t border-[var(--card-border)]",
  };

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          "absolute bg-[var(--background)] shadow-pop overflow-y-auto animate-slide-up",
          sideClasses[side],
        )}
        data-sheet-side={side}
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="close"
          className="absolute top-3 right-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--muted-bg)] hover:text-[var(--foreground)] transition-all"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function SheetContent({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

export function SheetHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mb-5 pr-10", className)}>{children}</div>;
}

export function SheetTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h2 className={cn("text-base font-bold tracking-tight text-[var(--foreground)]", className)}>
      {children}
    </h2>
  );
}

export function SheetDescription({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <p className={cn("text-xs text-[var(--muted)] mt-1", className)}>{children}</p>;
}
