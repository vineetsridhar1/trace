export interface CommandPaletteGroup<T> {
  name: string;
  items: T[];
}

export function limitCommandPaletteGroups<T>(
  groups: CommandPaletteGroup<T>[],
  perGroup: number,
  total: number,
): CommandPaletteGroup<T>[] {
  let remaining = total;
  const limited: CommandPaletteGroup<T>[] = [];
  for (const group of groups) {
    if (remaining === 0) break;
    const items = group.items.slice(0, Math.min(perGroup, remaining));
    if (items.length === 0) continue;
    limited.push({ name: group.name, items });
    remaining -= items.length;
  }
  return limited;
}
