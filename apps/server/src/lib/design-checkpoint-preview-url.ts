function serverPublicUrl(): string {
  const configured = process.env.TRACE_SERVER_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return `http://localhost:${process.env.PORT ?? "4000"}`;
}

export function designCheckpointPreviewUrl(checkpointId: string): string {
  return `${serverPublicUrl()}/design-previews/${encodeURIComponent(checkpointId)}`;
}
