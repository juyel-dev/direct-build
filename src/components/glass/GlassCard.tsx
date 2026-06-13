import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

export function GlassCard({
  className,
  strong = false,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { strong?: boolean; children?: ReactNode }) {
  return (
    <div
      className={cn(
        strong ? "glass-strong" : "glass",
        "rounded-2xl",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function GlassPanel({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <GlassCard className={cn("p-6", className)}>
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h2 className="text-base font-semibold text-foreground tracking-tight">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </GlassCard>
  );
}
