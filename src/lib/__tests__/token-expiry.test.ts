import { describe, it, expect } from "vitest";
import { isFacebookTokenErrorCode, isTerminalJobFailure } from "../../shared/aurora-shared";

describe("Facebook token expiry detection logic", () => {
  it("detects OAuthException with code 190", () => {
    expect(isFacebookTokenErrorCode(190)).toBe(true);
  });

  it("does not flag non-token errors as expiry", () => {
    expect(isFacebookTokenErrorCode(100)).toBe(false);
  });

  it("handles missing error code gracefully", () => {
    expect(isFacebookTokenErrorCode(undefined)).toBe(false);
    expect(isFacebookTokenErrorCode(null)).toBe(false);
  });

  it("marks job terminal on token expiry, even on the first attempt", () => {
    const detail = "TOKEN_EXPIRED: Facebook token expired. Update in Settings.";
    expect(isTerminalJobFailure(detail, 0, 10)).toBe(true);
  });

  it("marks job terminal once attempts reach max_attempts", () => {
    expect(isTerminalJobFailure("Some transient error", 10, 10)).toBe(true);
  });

  it("does not mark terminal for a non-token, non-exhausted error", () => {
    expect(isTerminalJobFailure("Some transient error", 0, 10)).toBe(false);
  });
});
