"use client";

import { cn } from "@/lib/utils";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto animate-slide-up">
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function DialogContent({
  className,
  children,
  showClose = true,
  onClose,
}: {
  className?: string;
  children: ReactNode;
  showClose?: boolean;
  onClose?: () => void;
}) {
  return (
    <div
      className={cn(
        "relative w-full bg-[var(--background)] border border-[var(--card-border)] sm:rounded-2xl rounded-t-2xl shadow-pop p-5",
        className,
      )}
    >
      {showClose && onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          className="absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--muted-bg)] hover:text-[var(--foreground)] transition-all"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  );
}

export function DialogHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mb-4 pr-8", className)}>{children}</div>;
}

export function DialogTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h2 className={cn("text-base font-bold tracking-tight text-[var(--foreground)]", className)}>
      {children}
    </h2>
  );
}

export function DialogDescription({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <p className={cn("text-xs text-[var(--muted)] mt-1", className)}>{children}</p>;
}

export function DialogFooter({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mt-5 flex justify-end gap-2", className)}>{children}</div>;
}
