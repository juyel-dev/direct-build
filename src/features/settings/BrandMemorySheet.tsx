import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/glass/BottomSheet";
import { GlassInput, GlassTextarea } from "@/components/glass/GlassInput";
import { GlassButton } from "@/components/glass/GlassButton";
import { createUserClient } from "@/services/supabase-factory";
import { BrandMemoryService } from "@/services/brand-memory.service";
import { Field, SaveBar } from "./shared";
import { SparklesIcon } from "@heroicons/react/24/outline";
import type { BrandMemory } from "@/types";

type SheetProps = {
  open: boolean;
  onClose: () => void;
};

export function BrandMemorySheet({ open, onClose }: SheetProps) {
  const [memory, setMemory] = useState<BrandMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    loadMemory();
  }, [open]);

  async function loadMemory() {
    setLoading(true);
    setError(null);
    try {
      const sb = await createUserClient();
      if (!sb) { setError("Unlock your vault first."); return; }
      const svc = new BrandMemoryService(sb);
      const pages = await sb.from("pages").select("id").limit(1);
      const pageId = (pages.data?.[0] as { id?: string })?.id;
      if (!pageId) { setError("No page configured. Run Setup first."); return; }
      const m = await svc.load(pageId);
      setMemory(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load brand memory");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!memory) return;
    setSaving(true);
    setError(null);
    try {
      const sb = await createUserClient();
      if (!sb) return;
      const svc = new BrandMemoryService(sb);
      await svc.save(memory.page_id, {
        brand_descriptors: memory.brand_descriptors,
        writing_style_notes: memory.writing_style_notes,
        tone_guidelines: memory.tone_guidelines,
        avoided_topics: memory.avoided_topics,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleAutoExtract() {
    setExtracting(true);
    setError(null);
    try {
      const sb = await createUserClient();
      if (!sb) return;
      const pages = await sb.from("pages").select("id").limit(1);
      const pageId = (pages.data?.[0] as { id?: string })?.id;
      if (!pageId) return;
      const svc = new BrandMemoryService(sb);
      const extracted = await svc.autoExtract(pageId);
      const m = await svc.save(pageId, extracted);
      setMemory(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Brand Memory &mdash; what AI knows"
      footer={
        memory && (
          <SaveBar
            onSave={handleSave}
            onClose={onClose}
            saving={saving}
            saved={saved}
            error={error}
            label="Save brand memory"
          />
        )
      }
    >
      {loading && <p className="text-sm text-muted-foreground">Loading brand memory...</p>}
      {error && !saving && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !memory && !error && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            No brand memory yet. Auto-extract from your published posts to help the AI understand your brand.
          </p>
          <GlassButton
            variant="primary"
            loading={extracting}
            onClick={handleAutoExtract}
          >
            <SparklesIcon className="h-4 w-4" /> Auto-extract brand memory
          </GlassButton>
        </div>
      )}
      {memory && (
        <div className="flex flex-col gap-4">
          <GlassButton
            variant="subtle"
            loading={extracting}
            onClick={handleAutoExtract}
            className="w-full"
          >
            <SparklesIcon className="h-3.5 w-3.5" /> Re-extract from recent posts
          </GlassButton>

          <Field
            label="Brand descriptors"
            hint="Adjectives that describe your brand"
          >
            <GlassInput
              value={memory.brand_descriptors.join(", ")}
              onChange={(e) =>
                setMemory({
                  ...memory,
                  brand_descriptors: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="modern, trustworthy, innovative"
            />
          </Field>

          <Field label="Writing style">
            <GlassTextarea
              value={memory.writing_style_notes}
              onChange={(e) =>
                setMemory({ ...memory, writing_style_notes: e.target.value })
              }
              placeholder="Short sentences. Occasional humour. Never salesy."
            />
          </Field>

          <Field label="Tone guidelines">
            <GlassTextarea
              value={memory.tone_guidelines}
              onChange={(e) =>
                setMemory({ ...memory, tone_guidelines: e.target.value })
              }
              placeholder="Warm, knowledgeable, approachable."
            />
          </Field>

          <Field label="Effective hashtags">
            <GlassInput
              value={memory.effective_hashtags.join(", ")}
              onChange={(e) =>
                setMemory({
                  ...memory,
                  effective_hashtags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="#coffee, #specialty"
            />
          </Field>

          <Field label="Avoided topics">
            <GlassInput
              value={memory.avoided_topics.join(", ")}
              onChange={(e) =>
                setMemory({
                  ...memory,
                  avoided_topics: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="politics, religion"
            />
          </Field>

          <Field label="Top content &mdash; auto-extracted">
            <div className="space-y-2">
              {(memory.top_content_snippets as Array<{ topic?: string; caption?: string; score?: number }>)
                .slice(0, 3)
                .map((s, i) => (
                  <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
                    <span className="font-medium text-white/80">{s.topic ?? "Untitled"}</span>
                    <p className="mt-1 text-muted-foreground line-clamp-2">{s.caption}</p>
                    <span className="mt-1 inline-block text-[10px] text-warning">
                      score: {s.score ?? 0}
                    </span>
                  </div>
                ))}
              {memory.top_content_snippets.length === 0 && (
                <p className="text-xs text-muted-foreground">No content extracted yet.</p>
              )}
            </div>
          </Field>

          <div className="flex gap-2 text-[11px] text-muted-foreground">
            {memory.auto_extracted_at && (
              <span>Auto-extracted: {new Date(memory.auto_extracted_at).toLocaleDateString()}</span>
            )}
            {memory.manually_edited_at && (
              <span>Edited: {new Date(memory.manually_edited_at).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
