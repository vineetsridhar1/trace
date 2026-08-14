export function extractVersion(value: string): string | null {
  const match = value.match(/\d+(?:\.\d+)+(?:[-+][\w.-]+)?/);
  return match?.[0] ?? null;
}

export function compareVersions(left: string, right: string): number | null {
  const parse = (version: string) => version.split("-")[0]!.split(".").map(Number);
  const leftParts = parse(left);
  const rightParts = parse(right);
  if ([...leftParts, ...rightParts].some((part) => !Number.isFinite(part))) return null;

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
