import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

export interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-br from-[oklch(0.82_0.16_195)] to-[oklch(0.72_0.18_280)] text-primary-foreground shadow-[0_8px_30px_-8px_color-mix(in_oklab,var(--primary)_70%,transparent)] hover:brightness-110",
  secondary:
    "glass text-foreground hover:bg-[oklch(1_0_0_/_0.10)]",
  subtle:
    "bg-white/5 text-foreground hover:bg-white/10 border border-white/10",
  ghost:
    "text-muted-foreground hover:text-foreground hover:bg-white/5",
  destructive:
    "bg-destructive/90 text-destructive-foreground hover:bg-destructive",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-xl gap-2",
  lg: "h-12 px-6 text-sm rounded-xl gap-2",
  icon: "h-10 w-10 rounded-xl",
};

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant = "secondary", size = "md", loading, children, disabled, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all duration-150",
          "active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:opacity-50 disabled:pointer-events-none",
          variants[variant],
          sizes[size],
          className,
        )}
        {...rest}
      >
        {loading ? (
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : null}
        {children}
      </button>
    );
  },
);
GlassButton.displayName = "GlassButton";
