import { describe, it, expect } from "vitest";
import { ScheduleService } from "../schedule.service";

function createService() {
  return new ScheduleService();
}

describe("ScheduleService", () => {
  describe("generateWeekDays", () => {
    it("returns 7 days for offset 0", () => {
      const svc = createService();
      const days = svc.generateWeekDays(0);
      expect(days).toHaveLength(7);
    });

    it("starts from today for offset 0", () => {
      const svc = createService();
      const days = svc.generateWeekDays(0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      expect(days[0].getTime()).toBeGreaterThanOrEqual(today.getTime() - 1000);
    });

    it("shifts by 7 days per offset", () => {
      const svc = createService();
      const w0 = svc.generateWeekDays(0);
      const w1 = svc.generateWeekDays(1);
      const diffDays = (w1[0].getTime() - w0[0].getTime()) / 86400_000;
      expect(diffDays).toBeCloseTo(7, 0);
    });
  });

  describe("nextSuggestedSlot", () => {
    const windows = [
      { hour: 9, minute: 0 },
      { hour: 13, minute: 0 },
      { hour: 18, minute: 0 },
    ];

    it("returns first window when no slots used", () => {
      const svc = createService();
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      const result = svc.nextSuggestedSlot(day, [], windows);
      expect(result.getHours()).toBe(9);
      expect(result.getMinutes()).toBe(0);
      expect(result.getDate()).toBe(day.getDate());
    });

    it("returns second window when first is used", () => {
      const svc = createService();
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      const used = [new Date(day)];
      used[0].setHours(9, 0, 0, 0);
      const result = svc.nextSuggestedSlot(day, used, windows);
      expect(result.getHours()).toBe(13);
    });

    it("returns fallback after all windows used", () => {
      const svc = createService();
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      const used = [
        new Date(day).setHours(9, 0, 0, 0),
        new Date(day).setHours(13, 0, 0, 0),
        new Date(day).setHours(18, 0, 0, 0),
      ].map((t) => new Date(t));
      const result = svc.nextSuggestedSlot(day, used, windows);
      const lastWindow = new Date(day);
      lastWindow.setHours(18, 0, 0, 0);
      expect(result.getTime()).toBeGreaterThan(lastWindow.getTime());
    });

    it("uses default window when none provided", () => {
      const svc = createService();
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      const result = svc.nextSuggestedSlot(day, [], []);
      expect(result.getHours()).toBe(9);
    });
  });
});
