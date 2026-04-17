import { useState, type ReactNode } from "react";
import { Image as ImageIcon } from "lucide-react";
import { formatTime } from "./utils";
import { stripPromptWrapping } from "../interactionModes";
import { useAuthStore } from "../../../stores/auth";
import { Markdown } from "../../ui/Markdown";
import { ImageLightbox } from "../ImageLightbox";
import { getAuthHeaders } from "../../../stores/auth";

const API_URL = import.meta.env.VITE_API_URL ?? "";

function ImageChip({ imageKey, label }: { imageKey: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const handleClick = async () => {
    if (src) {
      setLightboxOpen(true);
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
        setLightboxOpen(true);
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
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground hover:bg-surface-deep cursor-pointer"
      >
        <ImageIcon size={12} />
        {loading ? "Loading…" : label}
      </button>
      {src && (
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
          <div className="text-sm leading-relaxed break-words">
            <Markdown>{displayText}</Markdown>
            {imageKeys && imageKeys.length > 0 && (
              <span className="inline-flex gap-1.5 flex-wrap ml-1 align-middle">
                {imageKeys.map((key, i) => (
                  <ImageChip key={key} imageKey={key} label={`Image ${i + 1}`} />
                ))}
              </span>
            )}
          </div>
        </div>
        {footer ? <div className="mt-1.5 w-full">{footer}</div> : null}
      </div>
    </div>
  );
}
