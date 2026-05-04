import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-xl border border-[var(--input-border)] bg-[var(--muted-bg)]",
        "px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]",
        "transition-colors focus:outline-none focus:border-[var(--foreground)]",
        "disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
