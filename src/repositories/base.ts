import { SupabaseClient } from "@supabase/supabase-js";
import { AppError, NotFoundError } from "../errors";

export type QueryOptions = {
  limit?: number;
  offset?: number;
  order?: { column: string; ascending?: boolean };
};

export type PaginatedResult<T> = {
  data: T[];
  total: number | null;
  hasMore: boolean;
};

export abstract class BaseRepository {
  constructor(protected readonly client: SupabaseClient) {}

  protected handleError(error: unknown, context: string): never {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new AppError(`Database error [${context}]: ${message}`, "DB_ERROR", 500);
  }

  protected async exists(table: string, column: string, value: unknown): Promise<boolean> {
    const { count, error } = await this.client
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(column, value);

    if (error) this.handleError(error, `${table}.exists`);
    return (count ?? 0) > 0;
  }

  protected async assertExists(table: string, column: string, value: unknown) {
    const found = await this.exists(table, column, value);
    if (!found) {
      throw new NotFoundError(table, String(value));
    }
  }

  protected async withPagination<T>(
    queryFn: () => any,
    options?: QueryOptions,
  ): Promise<PaginatedResult<T>> {
    const { count, error: countError } = await queryFn().select("*", { count: "exact", head: true });
    if (countError) this.handleError(countError, "paginatedQuery.count");

    let q = queryFn();
    if (options?.order) {
      q = q.order(options.order.column, { ascending: options.order.ascending ?? true });
    }
    if (options?.limit) q = q.limit(options.limit);
    if (options?.offset && options?.limit) {
      q = q.range(options.offset, options.offset + options.limit - 1);
    }

    const { data, error } = await q;
    if (error) this.handleError(error, "paginatedQuery.data");

    const typedData = (data ?? []) as T[];
    const limit = options?.limit ?? 20;
    return {
      data: typedData,
      total: count,
      hasMore: (count ?? 0) > (options?.offset ?? 0) + typedData.length,
    };
  }
}
