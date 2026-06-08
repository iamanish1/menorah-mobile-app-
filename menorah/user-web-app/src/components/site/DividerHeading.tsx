import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DividerHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-6 md:gap-8", className)}>
      <div className="h-px flex-1 bg-primary" />
      <h2 className="shrink-0 text-center font-display text-3xl leading-none tracking-[0.08em] md:text-[2.15rem]">{children}</h2>
      <div className="h-px flex-1 bg-primary" />
    </div>
  );
}
