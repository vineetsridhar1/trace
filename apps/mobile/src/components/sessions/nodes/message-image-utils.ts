export interface MessageImageItem {
  key: string;
  imageKey?: string;
  previewUrl?: string;
  label: string;
}

export function buildMessageImageItems(
  imageKeys?: string[],
  previewUrls?: string[],
): MessageImageItem[] {
  const count = Math.max(imageKeys?.length ?? 0, previewUrls?.length ?? 0);
  return Array.from({ length: count }, (_, index) => {
    const imageKey = imageKeys?.[index];
    const previewUrl = previewUrls?.[index];
    if (!imageKey && !previewUrl) return null;
    return {
      key: imageKey ?? previewUrl ?? `image-${index}`,
      imageKey,
      previewUrl,
      label: `Image ${index + 1}`,
    };
  }).filter((item): item is MessageImageItem => item != null);
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
