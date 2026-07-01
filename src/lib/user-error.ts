import { createLogger } from "@/logger";

const log = createLogger("user-error");

const DEFAULTS: Record<string, string> = {
  approve: "Unable to approve draft. Please try again.",
  reject: "Unable to reject draft. Please try again.",
  save: "Unable to save draft. Please try again.",
  delete: "Unable to delete draft. Please try again.",
  schedule: "Unable to schedule post. Please try again.",
  compose: "Unable to create post. Please try again.",
};

function inferContext(stack?: string): string {
  if (!stack) return "save";
  if (stack.includes("approve")) return "approve";
  if (stack.includes("reject") || stack.includes("skip")) return "reject";
  if (stack.includes("delete")) return "delete";
  if (stack.includes("schedule")) return "schedule";
  if (stack.includes("compose") || stack.includes("publish")) return "compose";
  return "save";
}

export function sanitizeError(
  raw: unknown,
  context?: string,
): string {
  const ctx = context ?? inferContext(new Error().stack);
  const message = raw instanceof Error ? raw.message : String(raw);

  log.warn("Sanitized error", { context: ctx, original: message });

  return DEFAULTS[ctx] ?? DEFAULTS.save;
}
