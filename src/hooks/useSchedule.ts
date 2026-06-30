import { useState, useMemo, useCallback } from "react";
import { isSameDay, addMinutes, format } from "date-fns";
import { toast } from "sonner";
import { loadBrand } from "../lib/config-store";
import { useScheduleData, type ScheduleBrief } from "./useAuroraQuery";
import { createUserClient } from "../services/supabase-factory";
import { PublishingService } from "../services/publishing/publishing.service";
import { ScheduleService } from "../services/schedule/schedule.service";
import { AiService } from "../services/ai/ai.service";
import { buildLlmConfig } from "../services/ai/providers/llm-providers";
import { getSessionPassphrase, loadSecrets, loadProviders } from "../lib/config-store";

export type ViewMode = "week" | "list";

export function useSchedule() {
  const [pageId, setPageId] = useState<string>("");
  const [editing, setEditing] = useState<ScheduleBrief | null>(null);
  const [previewing, setPreviewing] = useState<ScheduleBrief | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [search, setSearch] = useState("");
  const brand = useMemo(() => loadBrand(), []);

  const scheduleSvc = useMemo(() => new ScheduleService(), []);
  const weekDays = useMemo(() => scheduleSvc.generateWeekDays(weekOffset), [weekOffset, scheduleSvc]);

  const { data, isLoading } = useScheduleData(weekDays, pageId);
  const pages = data?.pages ?? [];
  const allBriefs = data?.briefs ?? [];

  const briefs = useMemo(() => {
    if (!search.trim()) return allBriefs;
    const q = search.toLowerCase();
    return allBriefs.filter(
      (b) =>
        b.topic?.toLowerCase().includes(q) ||
        b.caption?.toLowerCase().includes(q) ||
        b.hashtags?.some((h) => h.toLowerCase().includes(q)),
    );
  }, [allBriefs, search]);

  const effectivePageId = pageId || pages[0]?.id || "";
  const currentPage = pages.find((p) => p.id === effectivePageId);

  const nextSuggestedSlot = useCallback(
    (forDay: Date): Date => {
      const usedSlots = briefs
        .filter((b) => isSameDay(new Date(b.slot_start), forDay))
        .map((b) => new Date(b.slot_start));
      return scheduleSvc.nextSuggestedSlot(forDay, usedSlots, brand.postingWindows);
    },
    [briefs, brand.postingWindows, scheduleSvc],
  );

  const createBriefAt = useCallback(
    async (slot: Date) => {
      if (!effectivePageId) return;
      const sb = await createUserClient();
      if (!sb) return;
      const svc = new PublishingService(sb);
      const brief = await svc.createBrief({
        pageId: effectivePageId,
        slotStart: slot.toISOString(),
      });
      if (brief) {
        toast.success("Brief created!");
        setEditing(brief);
      }
    },
    [effectivePageId],
  );

  const patchBrief = useCallback(async (id: string, patch: Partial<ScheduleBrief>) => {
    const sb = await createUserClient();
    if (!sb) return;
    const svc = new PublishingService(sb);
    await svc.patchBrief(id, patch as Record<string, unknown>);
  }, []);

  const saveBrief = useCallback(
    async (b: ScheduleBrief) => {
      await patchBrief(b.id, {
        topic: b.topic,
        caption: b.caption,
        hashtags: b.hashtags,
        image_prompt: b.image_prompt,
        image_url: b.image_url,
        status: b.status,
        slot_start: b.slot_start,
      });
      setEditing(null);
      toast.success("Brief saved!");
    },
    [patchBrief],
  );

  const deleteBrief = useCallback(async (id: string) => {
    const sb = await createUserClient();
    if (!sb) return;
    const svc = new PublishingService(sb);
    await svc.deleteBrief(id);
    setEditing(null);
    toast.info("Brief deleted.");
  }, []);

  const generateCaption = useCallback(
    async (b: ScheduleBrief) => {
      setGenerating(b.id);
      try {
        const pass = getSessionPassphrase();
        const secrets = pass ? await loadSecrets(pass) : null;
        if (!secrets?.aiApiKey) throw new Error("Add an LLM API key in Settings ▸ Secrets first.");
        const providers = loadProviders();
        const baseUrl = providers.llm.baseUrl || "";
        if (!baseUrl) throw new Error("Configure a Base URL for the custom provider.");

        const ai = new AiService();
        const config = buildLlmConfig(providers.llm.type, providers.llm.model, providers.llm.baseUrl, secrets.aiApiKey);
        const sys = `You are a social media copywriter for the brand "${brand.brandName || "the brand"}".
Voice: ${brand.voice || "warm, knowledgeable"}.
Audience: ${brand.audience || "general"}.
Write JSON only: {"topic": string, "caption": string, "hashtags": string[], "image_prompt": string}.
Caption ≤ 280 chars. 5-8 lowercase hashtags. Image prompt is a vivid scene description.`;
        const user = `Topic seed: ${b.topic || "anything that fits the brand"}. Slot: ${format(new Date(b.slot_start), "EEEE HH:mm")}.`;

        const parsed = await ai.generateCaptionWithJson(config, { systemPrompt: sys, userPrompt: user });
        const updated: ScheduleBrief = {
          ...b,
          topic: (parsed.topic as string) || b.topic,
          caption: (parsed.caption as string) || b.caption,
          hashtags: Array.isArray(parsed.hashtags) ? (parsed.hashtags as string[]) : b.hashtags,
          image_prompt: (parsed.image_prompt as string) || b.image_prompt,
        };
        setEditing(updated);
        toast.success("Content generated!");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setGenerating(null);
      }
    },
    [brand],
  );

  const onDragStart = useCallback((e: React.DragEvent, b: ScheduleBrief) => {
    e.dataTransfer.setData("text/brief-id", b.id);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const onDropOnDay = useCallback(
    async (e: React.DragEvent, day: Date) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/brief-id");
      const b = briefs.find((x) => x.id === id);
      if (!b) return;
      const cur = new Date(b.slot_start);
      if (isSameDay(cur, day)) return;
      const next = new Date(day);
      next.setHours(cur.getHours(), cur.getMinutes(), 0, 0);
      await patchBrief(b.id, { slot_start: next.toISOString() });
      toast.success("Brief moved!");
    },
    [briefs, patchBrief],
  );

  return {
    pageId: effectivePageId,
    pages,
    briefs,
    currentPage,
    editing,
    previewing,
    generating,
    view,
    weekOffset,
    weekDays,
    search,
    isLoading,
    brand,
    setPageId,
    setEditing,
    setPreviewing,
    setView,
    setWeekOffset,
    setSearch,
    createBriefAt,
    saveBrief,
    deleteBrief,
    generateCaption,
    onDragStart,
    onDropOnDay,
    patchBrief,
    nextSuggestedSlot,
  };
}
