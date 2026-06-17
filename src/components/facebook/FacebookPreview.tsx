import { GlobeAltIcon, HandThumbUpIcon, ChatBubbleOvalLeftIcon, ShareIcon } from "@heroicons/react/24/outline";
import { format } from "date-fns";

export function FacebookPreview({
  pageName,
  caption,
  hashtags,
  imageUrl,
  scheduledFor,
}: {
  pageName: string;
  caption: string;
  hashtags: string[];
  imageUrl?: string | null;
  scheduledFor?: Date | null;
}) {
  const tags = hashtags.length ? hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ") : "";
  const full = [caption, tags].filter(Boolean).join("\n\n");
  const initials = (pageName || "P").trim().slice(0, 1).toUpperCase();

  return (
    <div className="rounded-xl overflow-hidden bg-[#242526] text-[#e4e6eb] shadow-xl border border-white/5 font-sans">
      <div className="flex items-center gap-2.5 px-3 pt-3">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#1877f2] to-[#0a4fb8] grid place-items-center text-white font-bold">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight truncate">{pageName || "Your Page"}</p>
          <p className="text-[12px] text-[#b0b3b8] flex items-center gap-1">
            {scheduledFor ? format(scheduledFor, "MMM d 'at' h:mm a") : "Just now"}
            <span>·</span>
            <GlobeAltIcon className="h-3 w-3" />
          </p>
        </div>
        <button className="text-[#b0b3b8] text-xl leading-none px-2">⋯</button>
      </div>

      <div className="px-3 py-2.5">
        <p className="text-[15px] leading-snug whitespace-pre-wrap break-words">
          {full || <span className="text-[#b0b3b8] italic">Write a caption…</span>}
        </p>
      </div>

      {imageUrl ? (
        <div className="bg-black">
          <img src={imageUrl} alt="" className="w-full max-h-[420px] object-cover" />
        </div>
      ) : null}

      <div className="px-3 py-1.5 flex items-center justify-between text-[12px] text-[#b0b3b8] border-t border-white/5">
        <span>👍❤️ 0</span>
        <span>0 comments</span>
      </div>
      <div className="grid grid-cols-3 border-t border-white/5">
        {[
          { i: HandThumbUpIcon, l: "Like" },
          { i: ChatBubbleOvalLeftIcon, l: "Comment" },
          { i: ShareIcon, l: "Share" },
        ].map(({ i: Icon, l }) => (
          <button key={l} className="flex items-center justify-center gap-1.5 py-2 text-[13px] text-[#b0b3b8] hover:bg-white/5">
            <Icon className="h-4 w-4" /> {l}
          </button>
        ))}
      </div>
    </div>
  );
}
