export function hasSavedDesignPreview(groupPreviewUrl: string | null | undefined): boolean {
  return savedDesignPreviewUrl(groupPreviewUrl) !== null;
}

export function savedDesignPreviewUrl(groupPreviewUrl: string | null | undefined): string | null {
  return groupPreviewUrl ?? null;
}

export function designPreviewModeUrl(url: string): string {
  const [path, hash] = url.split("#", 2);
  if (/(?:^|[?&])__trace_preview(?:=|&|$)/.test(path)) return url;
  return `${path}${path.includes("?") ? "&" : "?"}__trace_preview=1${hash ? `#${hash}` : ""}`;
}
