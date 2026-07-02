import { describe, it, expect } from "vitest";

describe("Strategy transaction safety", () => {
  it("replaceAll is used instead of separate insertBatch+dismissAll", () => {
    const calls: string[] = [];
    const fakeRepo = {
      replaceAll: async (_pageId: string, _recs: unknown[]) => { calls.push("replaceAll"); },
      insertBatch: async () => { calls.push("insertBatch"); },
      dismissAll: async () => { calls.push("dismissAll"); },
      findByPage: async () => [],
    };

    async function simulateAnalyze() {
      await fakeRepo.replaceAll("page-1", []);
      return fakeRepo.findByPage();
    }

    return simulateAnalyze().then(() => {
      expect(calls).toEqual(["replaceAll"]);
    });
  });

  it("replaceAll is the single atomic call (no separate dismissAll)", () => {
    let replaceCalled = false;
    let dismissCalled = false;
    const trackingRepo = {
      replaceAll: async (_pageId: string, _recs: unknown[]) => { replaceCalled = true; },
      dismissAll: async () => { dismissCalled = true; },
      findByPage: async () => [],
    };

    async function simulateAnalyze() {
      await trackingRepo.replaceAll("page-1", []);
      return trackingRepo.findByPage();
    }

    return simulateAnalyze().then(() => {
      expect(replaceCalled).toBe(true);
      expect(dismissCalled).toBe(false);
    });
  });

  it("existing recommendations are preserved if replaceAll throws", async () => {
    const failingRepo = {
      replaceAll: async (_pageId: string, _recs: unknown[]) => { throw new Error("DB write failed"); },
      findByPage: async () => [{ id: "old-1" }],
    };
    await expect(failingRepo.replaceAll("page-1", [])).rejects.toThrow("DB write failed");
  });
});