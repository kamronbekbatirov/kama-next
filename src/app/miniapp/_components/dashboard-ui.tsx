"use client";

import { cn } from "@/lib/utils";
import { useState, type ReactNode, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { Check, Copy } from "lucide-react";

/**
 * SectionHeader — eyebrow + optional right-side action.
 * Replaces the scattered `text-[9px] uppercase tracking-[0.25em]` patterns.
 */
export function SectionHeader({
  eyebrow,
  title,
  trailing,
  className,
}: {
  eyebrow?: string;
  title?: string;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3 mb-3", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] font-medium mb-0.5">
            {eyebrow}
          </div>
        )}
        {title && <div className="text-base font-semibold tracking-tight">{title}</div>}
      </div>
      {trailing && <div className="shrink-0 flex items-center gap-2">{trailing}</div>}
    </div>
  );
}

/**
 * StatBlock — large number + small label. For hero stats.
 */
export function StatBlock({
  value,
  label,
  tone = "neutral",
  hint,
  className,
}: {
  value: ReactNode;
  label: string;
  tone?: "neutral" | "danger" | "success" | "warning";
  hint?: string;
  className?: string;
}) {
  const colorClass = {
    neutral: "text-[var(--foreground)]",
    danger: "text-red-500",
    success: "text-emerald-500",
    warning: "text-yellow-500",
  }[tone];

  return (
    <div className={cn("min-w-0", className)}>
      <div className={cn("text-2xl font-bold tabular-nums tracking-tight", colorClass)}>{value}</div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] mt-1 truncate">{label}</div>
      {hint && <div className="text-[10px] text-[var(--muted)] mt-0.5 tabular-nums">{hint}</div>}
    </div>
  );
}

/**
 * EmptyState — centered icon + title + hint.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-10 px-4 text-center", className)}>
      {icon && <div className="text-[var(--muted)] mb-3">{icon}</div>}
      <div className="text-sm font-semibold">{title}</div>
      {hint && <div className="text-xs text-[var(--muted)] mt-1 max-w-xs">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Pill — chip-style toggleable button. Replaces the
 * `text-[9px] uppercase tracking-[0.2em] px-3 py-1.5 border` pattern.
 */
export function Pill({
  active = false,
  onClick,
  children,
  size = "md",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-all cursor-pointer select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        size === "sm" ? "h-7 px-3 text-[11px]" : "h-8 px-3.5 text-xs",
        active
          ? "bg-[var(--foreground)] text-[var(--background)] shadow-soft"
          : "border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * Chip — non-interactive label-style chip (status, category).
 */
export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "muted" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  const toneClass = {
    neutral: "border-[var(--card-border)] text-[var(--foreground)]",
    muted: "border-[var(--card-border)] text-[var(--muted)]",
    success: "border-emerald-500/30 text-emerald-500 bg-emerald-500/10",
    warning: "border-yellow-500/30 text-yellow-500 bg-yellow-500/10",
    danger: "border-red-500/30 text-red-500 bg-red-500/10",
    info: "border-blue-500/30 text-blue-500 bg-blue-500/10",
  }[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        toneClass,
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * IconButton — square-ish small icon button (rounded). Standardized.
 */
export function IconButton({
  className,
  size = "md",
  variant = "ghost",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "outline" | "solid";
}) {
  const sizeClass = { sm: "h-7 w-7", md: "h-9 w-9", lg: "h-11 w-11" }[size];
  const variantClass = {
    ghost: "text-[var(--muted)] hover:bg-[var(--muted-bg)] hover:text-[var(--foreground)]",
    outline: "border border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]",
    solid: "bg-[var(--foreground)] text-[var(--background)] hover:opacity-85",
  }[variant];

  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-full transition-all cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        sizeClass,
        variantClass,
        className,
      )}
      {...rest}
    />
  );
}

/**
 * SoftCard — used everywhere as the dashboard's primary surface.
 * Slightly more padding than the default Card; consistent rhythm.
 */
export function SoftCard({
  className,
  children,
  as: Tag = "div",
  ...rest
}: {
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "article";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cn(
        "rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-soft",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * MetricRow — compact value + label arranged horizontally.
 * Inline alternative to StatBlock for dense lists.
 */
export function MetricRow({
  label,
  value,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "danger" | "success" | "warning";
  className?: string;
}) {
  const colorClass = {
    neutral: "",
    danger: "text-red-500",
    success: "text-emerald-500",
    warning: "text-yellow-500",
  }[tone];
  return (
    <div className={cn("flex items-center justify-between gap-3 py-2", className)}>
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <span className={cn("text-sm font-semibold tabular-nums", colorClass)}>{value}</span>
    </div>
  );
}

/**
 * CopyButton — small icon button that copies a generated string to the
 * clipboard. The text is built lazily so callers don't have to keep a
 * snapshot in render. Shows a green check for ~1.2s after success.
 */
export function CopyButton({
  getText,
  className,
  size = "sm",
  ...rest
}: {
  getText: () => string;
  className?: string;
  size?: "xs" | "sm" | "md";
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  const [copied, setCopied] = useState(false);
  const sz = { xs: "h-6 w-6", sm: "h-8 w-8", md: "h-9 w-9" }[size];
  const ic = { xs: "h-3 w-3", sm: "h-3.5 w-3.5", md: "h-4 w-4" }[size];
  const onClick = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard blocked — silently no-op */ }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center rounded-md shrink-0",
        "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]",
        "border border-[var(--card-border)] transition-colors cursor-pointer",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        sz,
        className,
      )}
      {...rest}
    >
      {copied ? <Check className={cn(ic, "text-emerald-500")} /> : <Copy className={ic} />}
    </button>
  );
}
