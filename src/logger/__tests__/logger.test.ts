import { describe, it, expect, vi } from "vitest";
import { createLogger } from "../index";

describe("createLogger", () => {
  it("creates logger with name", () => {
    const log = createLogger("TestService");
    expect(log).toBeDefined();
    expect(typeof log.debug).toBe("function");
  });

  it("logs info messages", () => {
    const log = createLogger("TestService");
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    log.info("test info");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logs warn messages", () => {
    const log = createLogger("TestService");
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    log.warn("test warn", { detail: "something" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logs error messages", () => {
    const log = createLogger("TestService");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("test error", { error: "boom" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("debug is suppressed by default log level", () => {
    const log = createLogger("TestService");
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    log.debug("should not appear");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
