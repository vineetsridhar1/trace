import { useState, type ReactNode } from "react";
import { FileText, Image as ImageIcon } from "lucide-react";
import { formatTime } from "./utils";
import { stripPromptWrapping } from "../interactionModes";
import { useAuthStore } from "@trace/client-core";
import { Markdown } from "../../ui/Markdown";
import { ImageLightbox } from "../ImageLightbox";
import { getAuthHeaders } from "@trace/client-core";

const API_URL = import.meta.env.VITE_API_URL ?? "";

function AttachmentChip({ imageKey, label }: { imageKey: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isImage = isImageKey(imageKey);

  const handleClick = async () => {
    if (src && isImage) {
      setLightboxOpen(true);
      return;
    }
    if (src) {
      window.open(src, "_blank", "noopener,noreferrer");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/uploads/url?key=${encodeURIComponent(imageKey)}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        setSrc(data.url);
        if (isImage) {
          setLightboxOpen(true);
        } else {
          window.open(data.url, "_blank", "noopener,noreferrer");
        }
      }
    } catch (err) {
      console.warn("Failed to load image URL:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => void handleClick()}
        className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-white transition-colors hover:bg-white/20 cursor-pointer"
      >
        {isImage ? <ImageIcon size={12} /> : <FileText size={12} />}
        {loading ? "Loading…" : label}
      </button>
      {src && isImage && (
        <ImageLightbox
          src={src}
          alt={label}
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}

export function UserBubble({
  text,
  timestamp,
  actorId,
  actorName,
  imageKeys,
  footer,
}: {
  text: string;
  timestamp: string;
  actorId?: string;
  actorName?: string | null;
  imageKeys?: string[];
  footer?: ReactNode;
}) {
  const currentUserId = useAuthStore((s: { user: { id: string } | null }) => s.user?.id);
  const isMe = !actorId || actorId === currentUserId;
  const displayName = isMe ? "You" : (actorName ?? "Someone");
  const displayText = stripPromptWrapping(text);

  return (
    <div className="flex justify-end">
      <div className="flex max-w-[85%] flex-col items-end">
        <div className="user-prompt-bubble px-3 py-2 w-full">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-semibold text-accent">{displayName}</span>
            <span className="text-[10px] text-muted-foreground">{formatTime(timestamp)}</span>
          </div>
          {imageKeys && imageKeys.length > 0 && (
            <div className="mb-1.5 flex gap-1.5 flex-wrap">
              {imageKeys.map((key) => (
                <AttachmentChip key={key} imageKey={key} label={attachmentLabel(key)} />
              ))}
            </div>
          )}
          <div className="text-sm leading-relaxed break-words">
            <Markdown>{displayText}</Markdown>
          </div>
        </div>
        {footer ? <div className="mt-1.5 w-full">{footer}</div> : null}
      </div>
    </div>
  );
}

function attachmentLabel(key: string): string {
  const filename = key
    .split("/")
    .pop()
    ?.replace(/^[0-9a-f-]{36}-/i, "");
  return filename || "Attachment";
}

function isImageKey(key: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(key);
}
