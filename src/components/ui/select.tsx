import { cn } from "@/lib/utils";
import { SelectHTMLAttributes, forwardRef } from "react";

const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "rounded-xl border border-[var(--input-border)] bg-[var(--muted-bg)]",
        "px-3 py-2 text-sm text-[var(--foreground)]",
        "focus:outline-none focus:border-[var(--foreground)] cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = "Select";

export { Select };
