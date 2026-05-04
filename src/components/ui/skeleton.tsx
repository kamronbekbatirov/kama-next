import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse-dot rounded-md bg-[var(--muted-bg)]", className)}
      {...props}
    />
  );
}
