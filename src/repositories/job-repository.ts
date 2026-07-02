import { BaseRepository } from "./base";

export type QueueDepth = {
  pending: number;
  processing: number;
  failedRetryable: number;
  deadLetter: number;
  total: number;
};

export class JobRepository extends BaseRepository {
  async countQueueDepth(): Promise<QueueDepth> {
    const statuses = ["pending", "processing", "failed_retryable", "dead_letter"] as const;
    const results = await Promise.all(
      statuses.map(async (status) => {
        const { count, error } = await this.client
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", status);
        if (error) this.handleError(error, `jobs.countQueueDepth.${status}`);
        return { status, count: count ?? 0 };
      }),
    );

    const map = Object.fromEntries(results.map((r) => [r.status, r.count]));
    const total = results.reduce((a, r) => a + r.count, 0);
    return {
      pending: map.pending,
      processing: map.processing,
      failedRetryable: map.failedRetryable,
      deadLetter: map.deadLetter,
      total,
    };
  }
}
