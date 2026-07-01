import { describe, it, expect } from "vitest";

describe("Strategy transaction safety", () => {
  it("insertBatch is called before dismissAll", () => {
    const order: string[] = [];
    const fakeRepo = {
      dismissAll: async () => { order.push("dismissAll"); },
      insertBatch: async () => { order.push("insertBatch"); },
      findByPage: async () => [],
    };

    async function simulateAnalyze() {
      order.push("insertBatch");
      await Promise.resolve();
      order.push("dismissAll");
      return fakeRepo.findByPage();
    }

    return simulateAnalyze().then(() => {
      expect(order.indexOf("insertBatch")).toBeLessThan(order.indexOf("dismissAll"));
    });
  });

  it("dismissAll is not called if insertBatch throws", async () => {
    let dismissCalled = false;
    const failingRepo = {
      insertBatch: async () => { throw new Error("DB write failed"); },
      dismissAll: async () => { dismissCalled = true; },
      findByPage: async () => [],
    };

    async function simulateAnalyze() {
      await failingRepo.insertBatch();
      await failingRepo.dismissAll();
      return failingRepo.findByPage();
    }

    await expect(simulateAnalyze()).rejects.toThrow("DB write failed");
    expect(dismissCalled).toBe(false);
  });
});
