import { logger } from "../logger";

export abstract class BaseService {
  constructor(protected readonly serviceName: string) {}

  protected log(method: string, message: string, context?: Record<string, unknown>) {
    logger.info(`[${this.serviceName}.${method}] ${message}`, context);
  }

  protected logError(method: string, message: string, context?: Record<string, unknown>) {
    logger.error(`[${this.serviceName}.${method}] ${message}`, context);
  }
}
