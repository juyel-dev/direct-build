import { GlassInput } from "./GlassInput";
import { GlassButton } from "./GlassButton";
import { EyeIcon, EyeSlashIcon, ClipboardIcon, CheckIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

export function SecretInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <GlassInput
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="pr-20"
      />
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
        <GlassButton
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            if (!value) return;
            navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
          title="Copy"
        >
          {copied ? <CheckIcon className="h-4 w-4 text-success" /> : <ClipboardIcon className="h-4 w-4" />}
        </GlassButton>
        <GlassButton
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setShow((s) => !s)}
          title={show ? "Hide" : "Show"}
        >
          {show ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
        </GlassButton>
      </div>
    </div>
  );
}
