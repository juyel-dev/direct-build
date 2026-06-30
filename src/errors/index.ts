import { logger } from "../logger";

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 500,
    public context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, context);
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super(message, "AUTHENTICATION_ERROR", 401);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Access denied") {
    super(message, "AUTHORIZATION_ERROR", 403);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} not found: ${id}` : `${resource} not found`,
      "NOT_FOUND",
      404,
    );
    this.name = "NotFoundError";
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(message, "CONFIGURATION_ERROR", 500);
    this.name = "ConfigurationError";
  }
}

export class ExternalServiceError extends AppError {
  constructor(
    service: string,
    status: number,
    detail: string,
  ) {
    super(
      `${service} returned ${status}: ${detail.slice(0, 200)}`,
      "EXTERNAL_SERVICE_ERROR",
      502,
      { service, upstreamStatus: status },
    );
    this.name = "ExternalServiceError";
  }
}

export function handleError(error: unknown, context?: string): AppError {
  if (error instanceof AppError) {
    logger.warn(`[${context ?? "unknown"}] ${error.message}`, {
      code: error.code,
      ...error.context,
    });
    return error;
  }

  if (error instanceof Error) {
    logger.error(`[${context ?? "unknown"}] ${error.message}`, {
      stack: error.stack,
    });
    return new AppError(error.message, "UNKNOWN_ERROR", 500);
  }

  const message = String(error);
  logger.error(`[${context ?? "unknown"}] Non-error thrown: ${message}`);
  return new AppError(message, "UNKNOWN_ERROR", 500);
}

export function assertContext(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new AppError(message, "CONTEXT_ASSERTION", 500);
  }
}
