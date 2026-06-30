import { describe, it, expect } from "vitest";
import {
  AppError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ExternalServiceError,
  ConfigurationError,
  RateLimitError,
} from "../index";

describe("AppError hierarchy", () => {
  it("creates AppError with message and context", () => {
    const err = new AppError("Something went wrong", "TEST_ERROR", 500, { detail: "test" });
    expect(err.message).toBe("Something went wrong");
    expect(err.code).toBe("TEST_ERROR");
    expect(err.context).toEqual({ detail: "test" });
    expect(err.name).toBe("AppError");
  });

  it("ValidationError has correct code and name", () => {
    const err = new ValidationError("Invalid input");
    expect(err.message).toBe("Invalid input");
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.name).toBe("ValidationError");
    expect(err).toBeInstanceOf(AppError);
  });

  it("AuthenticationError has correct code and name", () => {
    const err = new AuthenticationError("Not authorized");
    expect(err.message).toBe("Not authorized");
    expect(err.code).toBe("AUTHENTICATION_ERROR");
    expect(err).toBeInstanceOf(AppError);
  });

  it("NotFoundError formats message from resource + id", () => {
    const err = new NotFoundError("Page", "123");
    expect(err.message).toBe("Page not found: 123");
    expect(err.code).toBe("NOT_FOUND");
    expect(err).toBeInstanceOf(AppError);
  });

  it("NotFoundError works with resource only", () => {
    const err = new NotFoundError("Page");
    expect(err.message).toBe("Page not found");
    expect(err).toBeInstanceOf(AppError);
  });

  it("ExternalServiceError formats message from service + status + detail", () => {
    const err = new ExternalServiceError("facebook", 500, "Internal error");
    expect(err.message).toContain("facebook");
    expect(err.message).toContain("500");
    expect(err.message).toContain("Internal error");
    expect(err.code).toBe("EXTERNAL_SERVICE_ERROR");
    expect(err.service).toBeDefined();
    expect(err).toBeInstanceOf(AppError);
  });

  it("ConfigurationError has correct code and name", () => {
    const err = new ConfigurationError("Missing API key");
    expect(err.message).toBe("Missing API key");
    expect(err.code).toBe("CONFIGURATION_ERROR");
    expect(err).toBeInstanceOf(AppError);
  });

  it("RateLimitError has correct code and name", () => {
    const err = new RateLimitError("Too many requests", 60_000);
    expect(err.message).toBe("Too many requests");
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.retryAfterMs).toBe(60_000);
    expect(err).toBeInstanceOf(AppError);
  });

  it("instanceof works across the hierarchy", () => {
    const err = new ValidationError("bad");
    expect(err instanceof AppError).toBe(true);
    expect(err instanceof ValidationError).toBe(true);
    expect(err instanceof AuthenticationError).toBe(false);
  });
});
