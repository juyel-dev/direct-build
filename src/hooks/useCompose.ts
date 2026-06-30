import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { toast } from "sonner";
import { createUserClient } from "../services/supabase-factory";
import { PublishingService } from "../services/publishing/publishing.service";
import { AiService } from "../services/ai/ai.service";
import { loadBrand, loadProviders, getSessionPassphrase, loadSecrets } from "../lib/config-store";
import { buildLlmConfig } from "../services/ai/providers/llm-providers";

const ComposeSchema = z.object({
  topic: z.string().min(1, "Topic is required"),
  caption: z.string().min(1, "Caption is required").max(500, "Caption too long"),
  hashtags: z.string().optional(),
  imagePrompt: z.string().optional(),
});

type ComposeForm = z.infer<typeof ComposeSchema>;

export function useCompose(briefId?: string) {
  const brand = loadBrand();
  const providers = loadProviders();

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState(format(new Date(Date.now() + 3600_000), "yyyy-MM-dd"));
  const [scheduleTime, setScheduleTime] = useState("18:00");
  const [pageId, setPageId] = useState("");
  const [pageName, setPageName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<ComposeForm>({
    resolver: zodResolver(ComposeSchema),
    defaultValues: { topic: "", caption: "", hashtags: "", imagePrompt: "" },
  });

  const topic = watch("topic");
  const caption = watch("caption");

  // Load page info and optionally edit existing brief
  useEffect(() => {
    (async () => {
      const sb = await createUserClient();
      if (!sb) return;
      const svc = new PublishingService(sb);
      const page = await svc.loadPageInfo();
      if (page) {
        setPageId(page.id);
        setPageName(page.name);
      }
      if (briefId) {
        const b = await svc.loadBrief(briefId);
        if (b) {
          setValue("topic", (b.topic as string) || "");
          setValue("caption", (b.caption as string) || "");
          setValue("hashtags", ((b.hashtags as string[]) || []).join(", "));
          setValue("imagePrompt", (b.image_prompt as string) || "");
          setImageUrl((b.image_url as string) || null);
          if (b.slot_start) {
            const d = new Date(b.slot_start as string);
            setScheduleDate(format(d, "yyyy-MM-dd"));
            setScheduleTime(format(d, "HH:mm"));
          }
        }
      }
    })();
  }, [briefId, setValue]);

  const handleGenerateCaption = useCallback(async () => {
    if (!topic.trim()) {
      toast.error("Enter a topic first");
      return;
    }
    try {
      setGenerating(true);
      const pass = getSessionPassphrase();
      const secrets = pass ? await loadSecrets(pass) : null;
      const apiKey = secrets?.aiApiKey || "";
      if (!apiKey) {
        toast.error("No AI API key configured. Add one in Settings.");
        return;
      }
      const ai = new AiService();
      const config = buildLlmConfig(
        providers.llm.type,
        providers.llm.model || "meta-llama/llama-3.3-70b-instruct:free",
        providers.llm.baseUrl,
        apiKey,
      );
      const content = await ai.generateCaption(config, {
        topic,
        brandVoice: brand.voice,
      });
      if (content) {
        setValue("caption", content);
        toast.success("Caption generated!");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate caption");
    } finally {
      setGenerating(false);
    }
  }, [topic, brand.voice, providers.llm, setValue]);

  const handleGenerateImage = useCallback(async () => {
    const prompt = watch("imagePrompt");
    if (!prompt?.trim()) {
      toast.error("Enter an image prompt first");
      return;
    }
    try {
      setGeneratingImage(true);
      const ai = new AiService();
      const url = ai.generatePollinationsUrl(prompt);
      setImageUrl(url);
      toast.success("Image generated!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate image");
    } finally {
      setGeneratingImage(false);
    }
  }, [watch]);

  const handleUploadImage = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingImage(true);
      const sb = await createUserClient();
      if (!sb) throw new Error("No Supabase client");
      const svc = new PublishingService(sb);
      const url = await svc.uploadImage(file);
      setImageUrl(url);
      toast.success("Image uploaded!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to upload image");
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  }, []);

  const saveBrief = useCallback(
    async (status: string, publishImmediate: boolean) => {
      const values = watch();
      if (!values.caption.trim() && !values.topic.trim()) {
        toast.error("Write a caption or topic before saving");
        return;
      }
      if (!pageId) {
        toast.error("No Facebook page connected. Run Setup first.");
        return;
      }
      try {
        setSaving(true);
        setError(null);
        const sb = await createUserClient();
        if (!sb) return;

        const slotStart = publishImmediate
          ? new Date().toISOString()
          : new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();

        const hashtagArray = (values.hashtags || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t) => (t.startsWith("#") ? t : `#${t}`));

        const svc = new PublishingService(sb);
        await svc.saveDraft({
          pageId,
          slotStart,
          topic: values.topic,
          caption: values.caption,
          hashtags: hashtagArray,
          imagePrompt: values.imagePrompt || "",
          imageUrl,
          status,
          briefId,
        });

        toast.success(publishImmediate ? "Publishing now!" : "Post scheduled!");
        if (!briefId) {
          setValue("topic", "");
          setValue("caption", "");
          setValue("hashtags", "");
          setValue("imagePrompt", "");
          setImageUrl(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        toast.error(e instanceof Error ? e.message : "Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [pageId, scheduleDate, scheduleTime, imageUrl, briefId, setValue, watch],
  );

  return {
    brand,
    pageName,
    generating,
    generatingImage,
    uploadingImage,
    saving,
    error,
    scheduleDate,
    scheduleTime,
    imageUrl,
    topic,
    caption,
    register,
    errors,
    handleSubmit,
    watch,
    setValue,
    setScheduleDate,
    setScheduleTime,
    setImageUrl,
    handleGenerateCaption,
    handleGenerateImage,
    handleUploadImage,
    saveBrief,
  };
}
