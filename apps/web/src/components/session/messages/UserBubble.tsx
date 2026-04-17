import { useState, useEffect, type ReactNode } from "react";
import { formatTime } from "./utils";
import { stripPromptWrapping } from "../interactionModes";
import { useAuthStore } from "../../../stores/auth";
import { Markdown } from "../../ui/Markdown";
import { ImageLightbox } from "../ImageLightbox";
import { getAuthHeaders } from "../../../stores/auth";

const API_URL = import.meta.env.VITE_API_URL ?? "";

const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 50 * 60 * 1000;
const presignedUrlCache = new Map<string, { url: string; ts: number }>();

function getCachedUrl(key: string): string | undefined {
  const entry = presignedUrlCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    presignedUrlCache.delete(key);
    return undefined;
  }
  return entry.url;
}

function setCachedUrl(key: string, url: string) {
  if (presignedUrlCache.size >= CACHE_MAX_SIZE) {
    const oldest = presignedUrlCache.keys().next().value;
    if (oldest) presignedUrlCache.delete(oldest);
  }
  presignedUrlCache.set(key, { url, ts: Date.now() });
}

function ImageThumbnail({ imageKey, previewUrl }: { imageKey: string; previewUrl?: string }) {
  const cached = getCachedUrl(imageKey);
  const [src, setSrc] = useState<string | null>(previewUrl ?? cached ?? null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const layoutId = `msg-img-${imageKey}`;

  useEffect(() => {
    if (previewUrl || cached) return;
    let cancelled = false;
    fetch(`${API_URL}/uploads/url?key=${encodeURIComponent(imageKey)}`, {
      credentials: "include",
      headers: getAuthHeaders(),
    })
      .then((res) => res.json())
      .then((data: { url?: string }) => {
        if (!cancelled && data.url) {
          setCachedUrl(imageKey, data.url);
          setSrc(data.url);
        }
      })
      .catch((err) => { console.warn("Failed to load image URL:", err); });
    return () => { cancelled = true; };
  }, [imageKey, previewUrl, cached]);

  if (!src) {
    return (
      <div className="h-16 w-16 rounded-md bg-muted animate-pulse shrink-0" />
    );
  }

  return (
    <>
      <img
        src={src}
        alt="Attached image"
        className="h-16 w-16 rounded-md object-cover cursor-pointer border border-border shrink-0"
        onClick={() => setLightboxOpen(true)}
      />
      <ImageLightbox
        src={src}
        alt="Attached image"
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        layoutId={layoutId}
      />
    </>
  );
}

export function UserBubble({
  text,
  timestamp,
  actorId,
  actorName,
  imageKeys,
  imagePreviewUrls,
  footer,
}: {
  text: string;
  timestamp: string;
  actorId?: string;
  actorName?: string | null;
  imageKeys?: string[];
  imagePreviewUrls?: string[];
  footer?: ReactNode;
}) {
  const currentUserId = useAuthStore((s: { user: { id: string } | null }) => s.user?.id);
  const isMe = !actorId || actorId === currentUserId;
  const displayName = isMe ? "You" : (actorName ?? "Someone");
  const displayText = stripPromptWrapping(text);

  return (
    <div className="flex justify-end">
      <div className="flex max-w-[85%] flex-col items-end">
        {imageKeys && imageKeys.length > 0 && (
          <div className="mb-2 flex gap-2 flex-wrap justify-end">
            {imageKeys.map((key, i) => (
              <ImageThumbnail
                key={key}
                imageKey={key}
                previewUrl={imagePreviewUrls?.[i]}
              />
            ))}
          </div>
        )}
        <div className="user-prompt-bubble px-3 py-2 w-full">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-semibold text-accent">{displayName}</span>
            <span className="text-[10px] text-muted-foreground">{formatTime(timestamp)}</span>
          </div>
          <div className="text-sm leading-relaxed break-words">
            <Markdown>{displayText}</Markdown>
          </div>
        </div>
        {footer ? <div className="mt-1.5 w-full">{footer}</div> : null}
      </div>
    </div>
  );
}
