import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard, GlassPanel } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput, GlassTextarea, GlassLabel } from "@/components/glass/GlassInput";
import { FacebookPreview } from "@/components/facebook/FacebookPreview";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useCompose } from "@/hooks/useCompose";
import { loadInstallStatus, getSessionPassphrase, hasStoredSecrets } from "@/lib/config-store";
import { useRef } from "react";
import {
  SparklesIcon,
  PhotoIcon,
  PaperAirplaneIcon,
  CalendarDaysIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";


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

function ComposePage() {
  const { briefId } = useSearch({ from: Route.fullPath });
  const {
    pageName,
    generating,
    generatingImage,
    uploadingImage,
    saving,
    error,
    scheduleDate,
    scheduleTime,
    imageUrl,
    caption,
    register,
    errors,
    handleSubmit,
    watch,
    setScheduleDate,
    setScheduleTime,
    setImageUrl,
    handleGenerateCaption,
    handleGenerateImage,
    handleUploadImage,
    saveBrief,
  } = useCompose(briefId);

  const publishMode = useRef<"now" | "schedule">("schedule");
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


      <form onSubmit={handleSubmit(() => saveBrief("approved", publishMode.current === "now"))} className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-5">
          <GlassCard className="p-5">
            <GlassLabel hint="What is this post about?" htmlFor="topic">Topic</GlassLabel>
            <GlassInput
              id="topic"
              {...register("topic")}
              placeholder="e.g. Summer sale announcement"
              className="mt-1.5"
              aria-invalid={!!errors.topic}
            />
            {errors.topic && <p className="mt-1 text-xs text-destructive">{errors.topic.message}</p>}
          </GlassCard>

          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-2">
              <GlassLabel hint={`${caption?.length || 0}/280 chars`} htmlFor="caption">Caption</GlassLabel>
              <GlassButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleGenerateCaption}
                disabled={generating || !watch("topic")?.trim()}
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
              id="caption"
              {...register("caption")}
              placeholder="Write your post caption here..."
              rows={5}
              className="mt-1.5"
              aria-invalid={!!errors.caption}
            />
            {errors.caption && <p className="mt-1 text-xs text-destructive">{errors.caption.message}</p>}
          </GlassCard>

          <GlassCard className="p-5">
            <GlassLabel hint="Comma separated" htmlFor="hashtags">Hashtags</GlassLabel>
            <GlassInput
              id="hashtags"
              {...register("hashtags")}
              placeholder="#social, #marketing, #tips"
              className="mt-1.5"
            />
          </GlassCard>

          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-2">
              <GlassLabel hint="Generate, upload, or paste URL" htmlFor="imagePrompt">Image</GlassLabel>
              <div className="flex items-center gap-1.5">
                <label className="inline-flex items-center justify-center h-8 px-3 text-xs rounded-lg glass text-foreground hover:bg-[oklch(1_0_0_/_0.10)] cursor-pointer transition-all">
                  <ArrowPathIcon className="h-3.5 w-3.5" />
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUploadImage}
                    disabled={uploadingImage}
                  />
                </label>
                <GlassButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerateImage}
                  disabled={generatingImage || !watch("imagePrompt")?.trim()}
                >
                  {generatingImage ? (
                    <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PhotoIcon className="h-3.5 w-3.5" />
                  )}
                  AI Generate
                </GlassButton>
              </div>
            </div>
            <GlassInput
              id="imagePrompt"
              {...register("imagePrompt")}
              placeholder="Describe the image you want to generate..."
              className="mt-1.5"
            />
            {imageUrl && (
              <div className="mt-3 rounded-lg overflow-hidden border border-white/10">
                <img src={imageUrl} alt="Generated" loading="lazy" className="w-full max-h-[300px] object-cover" />
                <div className="p-2 flex justify-end">
                  <GlassButton type="button" variant="ghost" size="sm" onClick={() => setImageUrl(null)}>
                    Remove
                  </GlassButton>
                </div>
              </div>
            )}
          </GlassCard>
        </div>

        <div className="lg:col-span-2 space-y-5">
          <GlassPanel title="Preview" description="How it will look on Facebook.">
            <FacebookPreview
              pageName={pageName || "Your Page"}
              caption={caption || ""}
              hashtags={(watch("hashtags") || "").split(",").map((t) => t.trim()).filter(Boolean)}
              imageUrl={imageUrl}
              scheduledFor={new Date(`${scheduleDate}T${scheduleTime}`)}
            />
          </GlassPanel>

          <GlassCard className="p-5">
            <GlassLabel>Schedule</GlassLabel>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="scheduleDate" className="text-xs text-muted-foreground">Date</label>
                <input
                  id="scheduleDate"
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label htmlFor="scheduleTime" className="text-xs text-muted-foreground">Time</label>
                <input
                  id="scheduleTime"
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
              type="submit"
              variant="primary"
              size="lg"
              onClick={() => { publishMode.current = "now"; }}
              disabled={saving || (!caption?.trim() && !watch("topic")?.trim())}
            >
              {saving ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <PaperAirplaneIcon className="h-4 w-4" />}
              Publish Now
            </GlassButton>
            <GlassButton
              type="submit"
              variant="secondary"
              size="lg"
              onClick={() => { publishMode.current = "schedule"; }}
              disabled={saving || (!caption?.trim() && !watch("topic")?.trim())}
            >
              <CalendarDaysIcon className="h-4 w-4" />
              Schedule Post
            </GlassButton>
          </div>
        </div>
      </form>
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
