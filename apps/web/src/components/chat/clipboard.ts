export function pastedFilesFromClipboard(
  clipboardData: Pick<DataTransfer, "files" | "items"> | null | undefined,
): File[] {
  const files = Array.from(clipboardData?.files ?? []);
  if (files.length > 0) return files;

  // Mobile browsers commonly expose clipboard images as DataTransferItems,
  // without adding them to the FileList.
  return Array.from(clipboardData?.items ?? []).flatMap((item) => {
    if (item.kind !== "file" || !item.type.startsWith("image/")) return [];

    const file = item.getAsFile();
    return file ? [file] : [];
  });
}

export async function pastedImageFilesFromClipboard(): Promise<File[]> {
  if (!navigator.clipboard?.read) return [];

  const items = await navigator.clipboard.read();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const files = await Promise.all(
    items.flatMap((item) =>
      item.types
        .filter((type) => type.startsWith("image/"))
        .map(async (type) => {
          const blob = await item.getType(type);
          const extension = type.split("/")[1] || "png";
          return new File([blob], `pasted-image-${timestamp}.${extension}`, {
            type: blob.type || type,
            lastModified: Date.now(),
          });
        }),
    ),
  );

  return files;
}
