import { useEffect, useState } from "react";
import { type Secrets } from "@/lib/config-store";
import { GlassInput } from "@/components/glass/GlassInput";
import { SecretInput } from "@/components/glass/SecretInput";
import { BottomSheet } from "@/components/glass/BottomSheet";
import { testFacebook } from "@/lib/test-connections";
import { Field, TestRow, SaveBar } from "./shared";

export function FacebookSheet({
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
  const [draft, setDraft] = useState({
    id: secrets.facebookPageId ?? "",
    token: secrets.facebookPageToken ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft({ id: secrets.facebookPageId ?? "", token: secrets.facebookPageToken ?? "" });
      setSaved(false);
      setErr(null);
    }
  }, [open, secrets]);

  async function save() {
    setSaving(true);
    setErr(null);
    const res = await persist({
      ...secrets,
      facebookPageId: draft.id,
      facebookPageToken: draft.token,
    });
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
      title="Facebook page"
      description="Use a long-lived Page Access Token — see the note below before pasting one from Graph API Explorer."
      footer={<SaveBar onSave={save} onClose={onClose} saving={saving} saved={saved} error={err} />}
    >
      <div className="flex flex-col gap-4">
        <p className="text-[11px] leading-snug text-muted-foreground">
          Tokens copied directly from Graph API Explorer are usually
          short-lived (~1–2 hours) and will cause automation to silently
          stop working. Open Facebook's{" "}
          <a
            href="https://developers.facebook.com/tools/debug/accesstoken/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Access Token Debugger
          </a>{" "}
          and use "Extend Access Token" to get a long-lived one first, or
          click Test below after pasting — it will tell you how long your
          token has left.
        </p>
        <Field label="Page ID">
          <GlassInput
            value={draft.id}
            onChange={(e) => setDraft({ ...draft, id: e.target.value.trim() })}
            placeholder="1234567890"
            inputMode="numeric"
          />
        </Field>
        <Field label="Page access token">
          <SecretInput
            value={draft.token}
            onChange={(v) => setDraft({ ...draft, token: v.trim() })}
            placeholder="EAA..."
          />
        </Field>
        <TestRow
          label="Test Facebook"
          run={() => testFacebook(draft.token, draft.id || undefined)}
        />
      </div>
    </BottomSheet>
  );
}
