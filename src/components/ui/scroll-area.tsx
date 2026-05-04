import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function ScrollArea({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("overflow-y-auto overflow-x-hidden", className)}
      {...props}
    />
  );
}
