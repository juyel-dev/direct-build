import { describe, it, expect } from "vitest";
import { sanitizeError } from "../user-error";

describe("sanitizeError", () => {
  it("returns a safe message for an Error object", () => {
    const result = sanitizeError(new Error("constraint violation"), "save");
    expect(result).toBe("Unable to save draft. Please try again.");
  });

  it("returns a safe message for a string", () => {
    const result = sanitizeError("random crash", "compose");
    expect(result).toBe("Unable to create post. Please try again.");
  });

  it("returns a safe message for unknown input", () => {
    const result = sanitizeError(null, "reject");
    expect(result).toBe("Unable to reject draft. Please try again.");
  });

  it("falls back to save context when context is unknown", () => {
    const result = sanitizeError(new Error("something broke"), "unknown_context");
    expect(result).toBe("Unable to save draft. Please try again.");
  });

  it("logs the original error", () => {
    const result = sanitizeError(new Error("Database error [briefs]: constraint violation"), "approve");
    expect(result).toBe("Unable to approve draft. Please try again.");
  });
});
