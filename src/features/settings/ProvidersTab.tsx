import { useEffect, useState } from "react";
import { loadProviders, saveProviders, type Providers, ProvidersSchema, loadSecrets, getSessionPassphrase } from "@/lib/config-store";
import { GlassPanel } from "@/components/glass/GlassCard";
import { GlassInput, GlassLabel } from "@/components/glass/GlassInput";
import { GlassButton } from "@/components/glass/GlassButton";
import { testLLM } from "@/lib/test-connections";
import { CheckCircleIcon, ExclamationTriangleIcon, BeakerIcon } from "@heroicons/react/24/outline";

const LLM_TYPES = [
  ["openai", "OpenAI"],
  ["openrouter", "OpenRouter"],
  ["anthropic", "Anthropic"],
  ["nvidia", "NVIDIA NIM"],
  ["groq", "Groq"],
  ["ollama", "Ollama (local)"],
  ["lm_studio", "LM Studio (local)"],
  ["custom", "Custom OpenAI-compatible"],
] as const;

const IMAGE_TYPES = [
  ["pollinations", "Pollinations (free)"],
  ["replicate", "Replicate"],
  ["openai_dalle", "OpenAI DALL·E"],
  ["stability", "Stability AI"],
  ["custom_http", "Custom HTTP"],
] as const;

export function ProvidersTab() {
  const [providers, setProviders] = useState<Providers>(loadProviders());
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [test, setTest] = useState<{ ok: boolean; detail: string } | "running" | null>(null);

  useEffect(() => {
    setProviders(loadProviders());
  }, []);

  function handleSave() {
    const parsed = ProvidersSchema.safeParse(providers);
    if (!parsed.success) return;
    saveProviders(parsed.data);
    setSavedAt(Date.now());
  }

  async function runLLMTest() {
    setTest("running");
    const pass = getSessionPassphrase();
    const secrets = pass ? await loadSecrets(pass) : null;
    const result = await testLLM(providers, secrets?.aiApiKey ?? "");
    setTest(result);
  }

  return (
    <div className="flex flex-col gap-5">
      <GlassPanel
        title="LLM provider"
        description="Any OpenAI-compatible endpoint works. The model name is sent verbatim."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <GlassLabel>Provider</GlassLabel>
            <select
              value={providers.llm.type}
              onChange={(e) =>
                setProviders((p) => ({ ...p, llm: { ...p.llm, type: e.target.value as Providers["llm"]["type"] } }))
              }
              className="glass-input w-full h-11 rounded-xl px-3 text-sm focus:outline-none focus:glass-input-focus"
            >
              {LLM_TYPES.map(([v, label]) => (
                <option key={v} value={v} className="bg-background text-foreground">{label}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <GlassLabel>Model</GlassLabel>
            <GlassInput
              value={providers.llm.model}
              onChange={(e) => setProviders((p) => ({ ...p, llm: { ...p.llm, model: e.target.value } }))}
              placeholder="gpt-4o-mini"
            />
          </div>
          <div className="md:col-span-3">
            <GlassLabel hint="Leave empty to use the provider default">Base URL override</GlassLabel>
            <GlassInput
              value={providers.llm.baseUrl ?? ""}
              onChange={(e) => setProviders((p) => ({ ...p, llm: { ...p.llm, baseUrl: e.target.value.trim() } }))}
              placeholder="https://api.openai.com/v1"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <GlassButton size="sm" variant="subtle" loading={test === "running"} onClick={runLLMTest}>
            <BeakerIcon className="h-3.5 w-3.5" /> Test LLM
          </GlassButton>
          {test && test !== "running" && (
            <span className={`inline-flex items-center gap-1 text-[11px] ${test.ok ? "text-success" : "text-destructive"}`}>
              {test.ok ? <CheckCircleIcon className="h-3.5 w-3.5" /> : <ExclamationTriangleIcon className="h-3.5 w-3.5" />}
              {test.detail}
            </span>
          )}
        </div>
      </GlassPanel>

      <GlassPanel title="Image provider" description="Used to render the visual for each scheduled post.">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <GlassLabel>Provider</GlassLabel>
            <select
              value={providers.image.type}
              onChange={(e) =>
                setProviders((p) => ({ ...p, image: { ...p.image, type: e.target.value as Providers["image"]["type"] } }))
              }
              className="glass-input w-full h-11 rounded-xl px-3 text-sm focus:outline-none focus:glass-input-focus"
            >
              {IMAGE_TYPES.map(([v, label]) => (
                <option key={v} value={v} className="bg-background text-foreground">{label}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <GlassLabel>Model</GlassLabel>
            <GlassInput
              value={providers.image.model}
              onChange={(e) => setProviders((p) => ({ ...p, image: { ...p.image, model: e.target.value } }))}
              placeholder="flux"
            />
          </div>
        </div>
      </GlassPanel>

      <div className="flex items-center gap-3">
        <GlassButton variant="primary" size="lg" onClick={handleSave}>Save providers</GlassButton>
        {savedAt && (
          <span className="inline-flex items-center gap-1.5 text-xs text-success">
            <CheckCircleIcon className="h-4 w-4" /> Saved locally
          </span>
        )}
      </div>
    </div>
  );
}
