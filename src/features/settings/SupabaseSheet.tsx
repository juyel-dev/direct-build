import { useEffect, useState } from "react";
import {
  loadSecrets,
  saveSecrets,
  SecretsSchema,
  hasStoredSecrets,
  getSessionPassphrase,
  setSessionPassphrase,
  type Secrets,
} from "@/lib/config-store";
import { GlassInput } from "@/components/glass/GlassInput";
import { SecretInput } from "@/components/glass/SecretInput";
import { BottomSheet } from "@/components/glass/BottomSheet";
import { testSupabaseRest, testSupabaseServiceRole, testManagementApi } from "@/lib/test-connections";
import { invalidateUserSupabase } from "@/lib/user-supabase";
import { classifySupabaseKey } from "@/lib/supabase-keys";
import { projectRefFromUrl } from "@/lib/config-store";
import { ExclamationTriangleIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { Field, TestRow, SaveBar } from "./shared";

export function SupabaseSheet({
  open,
  onClose,
  secrets,
  persist,
}: {
  open: boolean;
  onClose: () => void;
  secrets: Secrets;
  persist: (s: Secrets) => Promise<{ ok: boolean; err?: string }>;
}) {
  const [draft, setDraft] = useState(secrets);
  const [passphrase, setPassphrase] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(secrets);
      setSaved(false);
      setErr(null);
      setNotice(null);
    }
  }, [open, secrets]);

  const needsPass = !getSessionPassphrase();
  const ref = projectRefFromUrl(draft.supabaseUrl);

  const anonKind = classifySupabaseKey(draft.supabaseAnonKey);
  const serviceKind = classifySupabaseKey(draft.supabaseServiceKey);
  const anonWarn =
    anonKind === "service"
      ? "This looks like a service_role key. Move it to the Service role field below."
      : null;
  const serviceWarn =
    serviceKind === "anon"
      ? "This looks like an anon/publishable key. Move it to the Anon field above."
      : null;

  async function save() {
    setSaving(true);
    setErr(null);
    setNotice(null);
    let next = draft;
    if (anonKind === "service" && serviceKind === "anon") {
      next = {
        ...draft,
        supabaseAnonKey: draft.supabaseServiceKey,
        supabaseServiceKey: draft.supabaseAnonKey,
      };
      setDraft(next);
      setNotice("Detected swapped keys — fixed automatically.");
    } else if (anonKind === "service" && !draft.supabaseServiceKey) {
      next = { ...draft, supabaseServiceKey: draft.supabaseAnonKey, supabaseAnonKey: "" };
      setDraft(next);
      setNotice("That was a service_role key — moved it to the Service field. Paste the anon key now.");
      setSaving(false);
      return;
    } else if (serviceKind === "anon" && !draft.supabaseAnonKey) {
      next = { ...draft, supabaseAnonKey: draft.supabaseServiceKey, supabaseServiceKey: "" };
      setDraft(next);
      setNotice("That was an anon key — moved it to the Anon field. Paste the service_role key now.");
      setSaving(false);
      return;
    }
    if (needsPass) setSessionPassphraseSafely(passphrase);
    const res = await persist(next);
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
      title="Supabase project"
      description="Settings ▸ API in your Supabase dashboard."
      footer={
        <div className="flex flex-col gap-2">
          {notice && <p className="text-xs text-primary">{notice}</p>}
          <SaveBar onSave={save} onClose={onClose} saving={saving} saved={saved} error={err} />
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Project URL" hint={ref ? `ref: ${ref}` : ".supabase.co"}>
          <GlassInput
            placeholder="https://xxxxxxxx.supabase.co"
            value={draft.supabaseUrl}
            onChange={(e) => setDraft({ ...draft, supabaseUrl: e.target.value.trim() })}
            inputMode="url"
            autoComplete="off"
          />
        </Field>
        <Field
          label="Anon (public) key"
          hint={
            anonKind === "anon"
              ? "✓ anon key detected"
              : anonKind === "service"
                ? null
                : "JWT eyJ… or sb_publishable_…"
          }
        >
          <SecretInput
            value={draft.supabaseAnonKey}
            onChange={(v) => setDraft({ ...draft, supabaseAnonKey: v.trim() })}
            placeholder="eyJhbGc... or sb_publishable_..."
          />
          {anonWarn && (
            <p className="mt-1 text-xs text-amber-400 flex items-start gap-1">
              <ExclamationTriangleIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {anonWarn}
            </p>
          )}
        </Field>
        <Field
          label="Service role key"
          hint={
            serviceKind === "service"
              ? "✓ service_role key detected"
              : serviceKind === "anon"
                ? null
                : "JWT eyJ… or sb_secret_…"
          }
        >
          <SecretInput
            value={draft.supabaseServiceKey}
            onChange={(v) => setDraft({ ...draft, supabaseServiceKey: v.trim() })}
            placeholder="eyJhbGc... or sb_secret_..."
          />
          {serviceWarn && (
            <p className="mt-1 text-xs text-amber-400 flex items-start gap-1">
              <ExclamationTriangleIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {serviceWarn}
            </p>
          )}
        </Field>
        <Field
          label="Personal access token"
          hint={
            <a
              className="text-primary inline-flex items-center gap-0.5"
              href="https://supabase.com/dashboard/account/tokens"
              target="_blank"
              rel="noreferrer"
            >
              create one <ArrowTopRightOnSquareIcon className="h-3 w-3" />
            </a>
          }
        >
          <SecretInput
            value={draft.supabasePAT}
            onChange={(v) => setDraft({ ...draft, supabasePAT: v.trim() })}
            placeholder="sbp_..."
          />
        </Field>

        {needsPass && (
          <Field label="Encryption passphrase" hint="8+ chars, stored only in this tab">
            <GlassInput
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <TestRow label="Test Anon key" run={() => testSupabaseRest(draft)} />
          <TestRow label="Test Service role" run={() => testSupabaseServiceRole(draft)} />
          <TestRow label="Test Management API" run={() => testManagementApi(draft)} />
        </div>
      </div>
    </BottomSheet>
  );
}

function setSessionPassphraseSafely(p: string) {
  if (p && p.length >= 8) setSessionPassphrase(p);
}
