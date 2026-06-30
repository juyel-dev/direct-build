import { describe, it, expect } from "vitest";
import type { QueryOptions, PaginatedResult } from "../base";

describe("QueryOptions & PaginatedResult types", () => {
  it("QueryOptions accepts limit and offset", () => {
    const opts: QueryOptions = { limit: 20, offset: 0 };
    expect(opts.limit).toBe(20);
    expect(opts.offset).toBe(0);
  });

  it("QueryOptions accepts order", () => {
    const opts: QueryOptions = { order: { column: "created_at", ascending: false } };
    expect(opts.order?.column).toBe("created_at");
  });

  it("PaginatedResult has correct shape", () => {
    const result: PaginatedResult<string> = {
      data: ["a", "b", "c"],
      total: 3,
      hasMore: false,
    };
    expect(result.data).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(false);
  });

  it("PaginatedResult with hasMore = true", () => {
    const result: PaginatedResult<number> = {
      data: [1, 2, 3, 4, 5],
      total: 25,
      hasMore: true,
    };
    expect(result.hasMore).toBe(true);
  });
});
