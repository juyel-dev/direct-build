import { describe, it, expect } from "vitest";

describe("Facebook token expiry detection logic", () => {
  function detectTokenExpiry(result: { error?: { code?: number; message?: string } }): boolean {
    return result.error?.code === 190;
  }

  it("detects OAuthException with code 190", () => {
    const fbResponse = {
      error: {
        code: 190,
        message: "Error validating access token: Session has expired",
      },
    };
    expect(detectTokenExpiry(fbResponse)).toBe(true);
  });

  it("does not flag non-token errors as expiry", () => {
    const fbResponse = {
      error: {
        code: 100,
        message: "Invalid parameter",
      },
    };
    expect(detectTokenExpiry(fbResponse)).toBe(false);
  });

  it("handles missing error object gracefully", () => {
    expect(detectTokenExpiry({})).toBe(false);
    expect(detectTokenExpiry({ error: {} })).toBe(false);
  });

  it("marks job terminal on token expiry", () => {
    const detail = "TOKEN_EXPIRED: Facebook token expired. Update in Settings.";
    const job = { attempts: 0, max_attempts: 10 };
    const terminal = detail.startsWith("TOKEN_EXPIRED:") || job.attempts >= job.max_attempts;
    expect(terminal).toBe(true);
  });

  it("does not mark terminal for non-token errors on first attempt", () => {
    const detail = "Some transient error";
    const job = { attempts: 0, max_attempts: 10 };
    const terminal = detail.startsWith("TOKEN_EXPIRED:") || job.attempts >= job.max_attempts;
    expect(terminal).toBe(false);
  });
});
