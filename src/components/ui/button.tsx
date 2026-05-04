"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 cursor-pointer select-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "active:scale-[0.97]",
          {
            "bg-[var(--foreground)] text-[var(--background)] hover:opacity-85": variant === "default",
            "border border-[var(--card-border)] bg-transparent text-[var(--foreground)] hover:bg-[var(--muted-bg)]": variant === "outline",
            "bg-transparent text-[var(--foreground)] hover:bg-[var(--muted-bg)]": variant === "ghost",
            "bg-red-600 text-white hover:bg-red-700": variant === "destructive",
            "bg-[var(--muted-bg)] text-[var(--foreground)] hover:opacity-80": variant === "secondary",
          },
          {
            "h-9 px-4 text-sm": size === "default",
            "h-7 px-3 text-xs": size === "sm",
            "h-11 px-6 text-base": size === "lg",
            "h-9 w-9 p-0": size === "icon",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
