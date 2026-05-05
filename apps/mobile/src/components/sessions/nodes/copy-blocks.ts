export interface CopyBlock {
  id: string;
  text: string;
}

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/u;

export function splitCopyBlocks(text: string): CopyBlock[] {
  const normalized = text.replace(/\r\n?/gu, "\n");
  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: { char: "`" | "~"; length: number } | null = null;

  for (const line of lines) {
    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch) {
      current.push(line);
      const marker = fenceMatch[1] ?? "";
      const char = marker[0] as "`" | "~" | undefined;
      if (char === "`" || char === "~") {
        if (!fence) {
          fence = { char, length: marker.length };
        } else if (fence.char === char && marker.length >= fence.length) {
          fence = null;
        }
      }
      continue;
    }

    if (!fence && line.trim() === "") {
      flushBlock(blocks, current);
      current = [];
      continue;
    }

    current.push(line);
  }

  flushBlock(blocks, current);

  return blocks.map((block, index) => ({ id: `copy-block-${index}`, text: block }));
}

function flushBlock(blocks: string[], lines: string[]) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.trim() === "") start++;
  while (end > start && lines[end - 1]?.trim() === "") end--;
  if (start >= end) return;
  blocks.push(lines.slice(start, end).join("\n"));
}
