export type SavedPdfPage = { height: number; width: number };

export function layoutSavedPdfPages(pages: readonly SavedPdfPage[], gap: number) {
  if (pages.length === 0) return { height: 0, offsets: [], width: 0 };
  const width = Math.max(...pages.map((page) => page.width));
  let offset = 0;
  const offsets = pages.map((page) => {
    const nextOffset = offset;
    offset += page.height + gap;
    return nextOffset;
  });

  return { height: Math.max(0, offset - gap), offsets, width };
}
