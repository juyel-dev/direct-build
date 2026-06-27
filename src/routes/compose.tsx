import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard, GlassPanel } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput, GlassTextarea, GlassLabel } from "@/components/glass/GlassInput";
import { FacebookPreview } from "@/components/facebook/FacebookPreview";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useEffect, useMemo, useState, useCallback } from "react";
import { getUserSupabase } from "@/lib/user-supabase";
import { loadBrand, loadProviders, loadInstallStatus, getSessionPassphrase, hasStoredSecrets, loadSecrets } from "@/lib/config-store";
import { proxyFetch } from "@/lib/proxy-fetch";
import {
  SparklesIcon,
  PhotoIcon,
  PaperAirplaneIcon,
  CalendarDaysIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/compose")({
  head: () => ({
    meta: [
      { title: "Compose — Aurora" },
      { name: "description", content: "Create and schedule Facebook posts." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    briefId: (search.briefId as string) || undefined,
  }),
  component: () => (
    <ErrorBoundary fallbackTitle="Compose page error">
      <ComposePage />
    </ErrorBoundary>
  ),
});

type BriefData = {
  id: string;
  page_id: string;
  slot_start: string;
  topic: string;
  caption: string;
  hashtags: string[];
  image_prompt: string;
  image_url: string | null;
  status: string;
};

function ComposePage() {
  const { briefId } = useSearch({ from: Route.fullPath });
  const brand = useMemo(() => loadBrand(), []);
  const providers = useMemo(() => loadProviders(), []);

  const [topic, setTopic] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState(format(new Date(Date.now() + 3600_000), "yyyy-MM-dd"));
  const [scheduleTime, setScheduleTime] = useState("18:00");
  const [pageId, setPageId] = useState("");
  const [pageName, setPageName] = useState("");

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const pass = getSessionPassphrase();
      if (!pass || !hasStoredSecrets()) return;
      const sb = await getUserSupabase();
      if (!sb) return;

      const { data: page } = await sb.from("pages").select("id, fb_page_name").limit(1).maybeSingle();
      if (page) {
        setPageId((page as { id: string }).id);
        setPageName((page as { fb_page_name: string }).fb_page_name);
      }

      if (briefId) {
        const { data: brief } = await sb
          .from("content_briefs")
          .select("id, page_id, slot_start, topic, caption, hashtags, image_prompt, image_url, status")
          .eq("id", briefId)
          .single();
        if (brief) {
          const b = brief as BriefData;
          setTopic(b.topic || "");
          setCaption(b.caption || "");
          setHashtags((b.hashtags || []).join(", "));
          setImagePrompt(b.image_prompt || "");
          setImageUrl(b.image_url);
          if (b.slot_start) {
            const d = new Date(b.slot_start);
            setScheduleDate(format(d, "yyyy-MM-dd"));
            setScheduleTime(format(d, "HH:mm"));
          }
        }
      }
    })();
  }, [briefId]);

  const handleGenerateCaption = async () => {
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
      const prompt = `Write a Facebook post caption about: ${topic}. Brand voice: ${brand.voice || "friendly and professional"}. Keep it under 280 characters, engaging, and non-spammy. Return ONLY the caption text, no quotes or labels.`;

      const r = await proxyFetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: providers.llm.model || "meta-llama/llama-3.3-70b-instruct:free",
          messages: [
            { role: "system", content: "You are a social media content writer. Return only the post caption." },
            { role: "user", content: prompt },
          ],
          temperature: 0.75,
          max_tokens: 300,
        }),
      });

      if (!r.ok) throw new Error(`AI request failed (${r.status})`);
      const data = await r.json<{ choices?: { message?: { content?: string } }[] }>();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (content) {
        setCaption(content);
        toast.success("Caption generated!");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate caption");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) {
      toast.error("Enter an image prompt first");
      return;
    }
    try {
      setGeneratingImage(true);
      const encoded = encodeURIComponent(imagePrompt);
      const url = `https://image.pollinations.ai/prompt/${encoded}?model=flux&nologo=true&width=1024&height=1024`;
      setImageUrl(url);
      toast.success("Image generated!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate image");
    } finally {
      setGeneratingImage(false);
    }
  };

  const handlePublishNow = async () => {
    await saveBrief("approved", true);
  };

  const handleSchedule = async () => {
    await saveBrief("approved", false);
  };

  const saveBrief = async (status: string, publishImmediate: boolean) => {
    if (!caption.trim() && !topic.trim()) {
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
      const sb = await getUserSupabase();
      if (!sb) return;

      const slotStart = publishImmediate
        ? new Date().toISOString()
        : new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();

      const hashtagArray = hashtags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => (t.startsWith("#") ? t : `#${t}`));

      const rowData = {
        page_id: pageId,
        slot_start: slotStart,
        topic,
        caption,
        hashtags: hashtagArray,
        image_prompt: imagePrompt,
        image_url: imageUrl,
        status,
        approved_at: status === "approved" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      if (briefId) {
        const { error } = await sb.from("content_briefs").update(rowData).eq("id", briefId);
        if (error) throw error;
      } else {
        const { error } = await sb.from("content_briefs").insert(rowData);
        if (error) throw error;
      }

      toast.success(publishImmediate ? "Publishing now!" : "Post scheduled!");
      if (!briefId) {
        setTopic("");
        setCaption("");
        setHashtags("");
        setImagePrompt("");
        setImageUrl(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const pass = getSessionPassphrase();
  if (!pass || !hasStoredSecrets()) {
    return (
      <AppShell>
        <EmptyComp
          title="Unlock to compose"
          subtitle="Enter your passphrase in Settings to create posts."
          cta={<Link to="/settings"><GlassButton variant="primary">Open Settings</GlassButton></Link>}
        />
      </AppShell>
    );
  }

  const install = loadInstallStatus();
  if (install.schemaVersion === 0) {
    return (
      <AppShell>
        <EmptyComp
          title="Run Setup first"
          subtitle="Aurora needs to provision your database before composing posts."
          cta={<Link to="/settings"><GlassButton variant="primary">Run Setup</GlassButton></Link>}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Create</p>
        <h1 className="mt-1 text-3xl md:text-4xl font-display font-medium">
          <span className="gradient-text">Compose</span> a post
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {briefId ? "Edit draft" : "Write, generate, and schedule your next Facebook post."}
        </p>
      </div>

      {error && (
        <GlassCard className="p-4 mb-6 border-destructive/30">
          <p className="text-sm text-destructive">{error}</p>
        </GlassCard>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Editor Panel */}
        <div className="lg:col-span-3 space-y-5">
          <GlassCard className="p-5">
            <GlassLabel hint="What is this post about?">Topic</GlassLabel>
            <GlassInput
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Summer sale announcement"
              className="mt-1.5"
            />
          </GlassCard>

          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-2">
              <GlassLabel hint={`${caption.length}/280 chars`}>Caption</GlassLabel>
              <GlassButton
                variant="secondary"
                size="sm"
                onClick={handleGenerateCaption}
                disabled={generating || !topic.trim()}
              >
                {generating ? (
                  <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <SparklesIcon className="h-3.5 w-3.5" />
                )}
                AI Assist
              </GlassButton>
            </div>
            <GlassTextarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write your post caption here..."
              rows={5}
              className="mt-1.5"
            />
          </GlassCard>

          <GlassCard className="p-5">
            <GlassLabel hint="Comma separated">Hashtags</GlassLabel>
            <GlassInput
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="#social, #marketing, #tips"
              className="mt-1.5"
            />
          </GlassCard>

          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-2">
              <GlassLabel hint="Generate or paste URL">Image</GlassLabel>
              <GlassButton
                variant="secondary"
                size="sm"
                onClick={handleGenerateImage}
                disabled={generatingImage || !imagePrompt.trim()}
              >
                {generatingImage ? (
                  <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PhotoIcon className="h-3.5 w-3.5" />
                )}
                AI Generate
              </GlassButton>
            </div>
            <GlassInput
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              placeholder="Describe the image you want to generate..."
              className="mt-1.5"
            />
            {imageUrl && (
              <div className="mt-3 rounded-lg overflow-hidden border border-white/10">
                <img src={imageUrl} alt="Generated" className="w-full max-h-[300px] object-cover" />
                <div className="p-2 flex justify-end">
                  <GlassButton variant="ghost" size="sm" onClick={() => setImageUrl(null)}>
                    Remove
                  </GlassButton>
                </div>
              </div>
            )}
          </GlassCard>
        </div>

        {/* Preview & Schedule Panel */}
        <div className="lg:col-span-2 space-y-5">
          <GlassPanel title="Preview" description="How it will look on Facebook.">
            <FacebookPreview
              pageName={pageName || brand.brandName || "Your Page"}
              caption={caption}
              hashtags={hashtags.split(",").map((t) => t.trim()).filter(Boolean)}
              imageUrl={imageUrl}
              scheduledFor={new Date(`${scheduleDate}T${scheduleTime}`)}
            />
          </GlassPanel>

          <GlassCard className="p-5">
            <GlassLabel>Schedule</GlassLabel>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Date</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Time</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
          </GlassCard>

          <div className="flex flex-col gap-3">
            <GlassButton
              variant="primary"
              size="lg"
              onClick={handlePublishNow}
              disabled={saving || (!caption.trim() && !topic.trim())}
            >
              {saving ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <PaperAirplaneIcon className="h-4 w-4" />}
              Publish Now
            </GlassButton>
            <GlassButton
              variant="secondary"
              size="lg"
              onClick={handleSchedule}
              disabled={saving || (!caption.trim() && !topic.trim())}
            >
              <CalendarDaysIcon className="h-4 w-4" />
              Schedule Post
            </GlassButton>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function EmptyComp({
  title,
  subtitle,
  cta,
}: {
  title: string;
  subtitle: string;
  cta?: React.ReactNode;
}) {
  return (
    <GlassCard className="p-12 text-center">
      <SparklesIcon className="mx-auto h-12 w-12 text-muted-foreground/30" />
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">{subtitle}</p>
      {cta && <div className="mt-6">{cta}</div>}
    </GlassCard>
  );
}
