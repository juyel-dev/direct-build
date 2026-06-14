import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

export const GlassInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        "glass-input block w-full min-w-0 h-11 rounded-xl px-3.5 text-sm text-foreground placeholder:text-muted-foreground",
        "focus:outline-none focus:glass-input-focus",
        "font-mono [&[type='password']]:font-mono",
        className,
      )}
      {...rest}
    />
  ),
);
GlassInput.displayName = "GlassInput";

export const GlassTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "glass-input w-full min-h-[88px] rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground",
        "focus:outline-none focus:glass-input-focus resize-y",
        className,
      )}
      {...rest}
    />
  ),
);
GlassTextarea.displayName = "GlassTextarea";

export function GlassLabel({
  children,
  hint,
  htmlFor,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-muted-foreground tracking-wide uppercase">
      <span>{children}</span>
      {hint && <span className="ml-2 normal-case font-normal text-muted-foreground/70">{hint}</span>}
    </label>
  );
}
