import { useEffect, useState } from "react";
import { type Providers } from "@/lib/config-store";
import { GlassInput } from "@/components/glass/GlassInput";
import { SecretInput } from "@/components/glass/SecretInput";
import { BottomSheet } from "@/components/glass/BottomSheet";
import { Field, SaveBar } from "./shared";

const IMAGE_TYPES: [Providers["image"]["type"], string, string][] = [
  ["pollinations", "Pollinations (free)", "https://image.pollinations.ai"],
  ["replicate", "Replicate", "https://api.replicate.com"],
  ["openai_dalle", "OpenAI DALL·E", "https://api.openai.com/v1"],
  ["stability", "Stability AI", "https://api.stability.ai"],
  ["custom_http", "Custom HTTP", ""],
];

export function ImageSheet({
  open,
  onClose,
  providers,
  apiKey,
  save,
}: {
  open: boolean;
  onClose: () => void;
  providers: Providers;
  apiKey: string;
  save: (p: Providers, key: string) => Promise<{ ok: boolean; err?: string }>;
}) {
  const [img, setImg] = useState(providers.image);
  const [key, setKey] = useState(apiKey);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setImg(providers.image);
      setKey(apiKey);
      setSaved(false);
      setErr(null);
    }
  }, [open, providers.image, apiKey]);

  function pickType(t: Providers["image"]["type"]) {
    const def = IMAGE_TYPES.find((x) => x[0] === t);
    setImg({ type: t, baseUrl: img.baseUrl || (def?.[2] ?? ""), model: img.model });
  }

  async function persist() {
    if (!img.model.trim()) {
      setErr("Model name is required.");
      return;
    }
    setSaving(true);
    setErr(null);
    const res = await save({ ...providers, image: img }, key);
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } else setErr(res.err ?? "Save failed.");
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Image provider"
      description="Renders the visual for each scheduled post."
      footer={
        <SaveBar
          onSave={persist}
          onClose={onClose}
          saving={saving}
          saved={saved}
          error={err}
          label="Save & continue"
        />
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Provider">
          <select
            value={img.type}
            onChange={(e) => pickType(e.target.value as Providers["image"]["type"])}
            className="glass-input w-full h-11 rounded-xl px-3 text-sm focus:outline-none focus:glass-input-focus"
          >
            {IMAGE_TYPES.map(([v, label]) => (
              <option key={v} value={v} className="bg-background text-foreground">
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Model name / id">
          <GlassInput
            value={img.model}
            onChange={(e) => setImg({ ...img, model: e.target.value })}
            placeholder="flux"
            autoComplete="off"
          />
        </Field>
        <Field label="Base URL" hint="optional">
          <GlassInput
            value={img.baseUrl ?? ""}
            onChange={(e) => setImg({ ...img, baseUrl: e.target.value.trim() })}
            placeholder=""
            inputMode="url"
            autoComplete="off"
          />
        </Field>
        <Field label="API key" hint="optional for Pollinations">
          <SecretInput value={key} onChange={(v) => setKey(v.trim())} placeholder="..." />
        </Field>
      </div>
    </BottomSheet>
  );
}
