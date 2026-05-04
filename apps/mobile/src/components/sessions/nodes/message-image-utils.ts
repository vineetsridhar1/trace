const PREVIEWABLE_IMAGE_EXTENSIONS = new Set(["gif", "jpeg", "jpg", "png", "webp"]);

interface BaseMessageAttachmentItem {
  key: string;
  filename: string;
  label: string;
}

export interface MessageImageItem extends BaseMessageAttachmentItem {
  kind: "image";
  imageKey?: string;
  previewUrl?: string;
}

export interface MessageFileItem extends BaseMessageAttachmentItem {
  kind: "file";
  imageKey: string;
}

export type MessageAttachmentItem = MessageImageItem | MessageFileItem;

export function buildMessageImageItems(
  imageKeys?: string[],
  previewUrls?: string[],
): MessageAttachmentItem[] {
  const count = Math.max(imageKeys?.length ?? 0, previewUrls?.length ?? 0);
  const items: MessageAttachmentItem[] = [];

  for (let index = 0; index < count; index += 1) {
    const imageKey = imageKeys?.[index];
    const previewUrl = previewUrls?.[index];
    if (!imageKey && !previewUrl) continue;
    const filename = filenameFromKey(imageKey) ?? `Attachment ${index + 1}`;

    if (previewUrl || isPreviewableImageKey(imageKey)) {
      items.push({
        key: imageKey ?? previewUrl ?? `image-${index}`,
        imageKey,
        previewUrl,
        filename,
        kind: "image",
        label: `Image ${index + 1}`,
      });
      continue;
    }

    if (imageKey) {
      items.push({
        key: imageKey,
        imageKey,
        filename,
        kind: "file",
        label: filename,
      });
    }
  }

  return items;
}

function isPreviewableImageKey(key?: string): boolean {
  const extension = key?.split("?")[0]?.split("#")[0]?.split(".").pop()?.toLowerCase();
  return extension ? PREVIEWABLE_IMAGE_EXTENSIONS.has(extension) : false;
}

function filenameFromKey(key?: string): string | null {
  const filename = key
    ?.split("/")
    .pop()
    ?.replace(/^[0-9a-f-]{36}-/i, "");
  return filename || null;
}

export function fitMessageImageSurface(
  windowWidth: number,
  windowHeight: number,
  aspectRatio: number | null,
): { width: number; height: number } {
  const maxWidth = Math.max(windowWidth - 40, 120);
  const maxHeight = Math.max(windowHeight - 160, 160);
  if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return {
      width: maxWidth,
      height: maxHeight,
    };
  }

  let width = maxWidth;
  let height = width / aspectRatio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  return { width, height };
}
