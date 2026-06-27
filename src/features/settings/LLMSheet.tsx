import { useEffect, useState } from "react";
import { type Providers } from "@/lib/config-store";
import { GlassInput } from "@/components/glass/GlassInput";
import { SecretInput } from "@/components/glass/SecretInput";
import { BottomSheet } from "@/components/glass/BottomSheet";
import { testLLM } from "@/lib/test-connections";
import { Field, TestRow, SaveBar } from "./shared";

const LLM_TYPES: [Providers["llm"]["type"], string, string][] = [
  ["openai", "OpenAI", "https://api.openai.com/v1"],
  ["openrouter", "OpenRouter", "https://openrouter.ai/api/v1"],
  ["anthropic", "Anthropic", "https://api.anthropic.com/v1"],
  ["nvidia", "NVIDIA NIM", "https://integrate.api.nvidia.com/v1"],
  ["groq", "Groq", "https://api.groq.com/openai/v1"],
  ["ollama", "Ollama (local)", "http://localhost:11434/v1"],
  ["lm_studio", "LM Studio (local)", "http://localhost:1234/v1"],
  ["custom", "Custom (OpenAI-compatible)", ""],
];

export function LLMSheet({
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
  const [llm, setLlm] = useState(providers.llm);
  const [key, setKey] = useState(apiKey);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLlm(providers.llm);
      setKey(apiKey);
      setErr(null);
      setSaved(false);
    }
  }, [open, providers.llm, apiKey]);

  function pickType(t: Providers["llm"]["type"]) {
    const def = LLM_TYPES.find((x) => x[0] === t);
    setLlm({ type: t, baseUrl: llm.baseUrl || (def?.[2] ?? ""), model: llm.model });
  }

  async function persist() {
    if (!llm.model.trim()) {
      setErr("Model name is required.");
      return;
    }
    setSaving(true);
    setErr(null);
    const res = await save({ ...providers, llm }, key);
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
      title="LLM provider"
      description="Any OpenAI-compatible endpoint. The model name is sent verbatim."
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
            value={llm.type}
            onChange={(e) => pickType(e.target.value as Providers["llm"]["type"])}
            className="glass-input w-full h-11 rounded-xl px-3 text-sm focus:outline-none focus:glass-input-focus"
          >
            {LLM_TYPES.map(([v, label]) => (
              <option key={v} value={v} className="bg-background text-foreground">
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Model name / id">
          <GlassInput
            value={llm.model}
            onChange={(e) => setLlm({ ...llm, model: e.target.value })}
            placeholder="gpt-4o-mini"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field label="Base URL" hint="leave empty for provider default">
          <GlassInput
            value={llm.baseUrl ?? ""}
            onChange={(e) => setLlm({ ...llm, baseUrl: e.target.value.trim() })}
            placeholder="https://api.openai.com/v1"
            inputMode="url"
            autoComplete="off"
          />
        </Field>
        <Field label="API key" hint="optional for local Ollama / LM Studio">
          <SecretInput value={key} onChange={(v) => setKey(v.trim())} placeholder="sk-..." />
        </Field>
        <TestRow label="Test endpoint" run={() => testLLM({ ...providers, llm }, key)} />
      </div>
    </BottomSheet>
  );
}
