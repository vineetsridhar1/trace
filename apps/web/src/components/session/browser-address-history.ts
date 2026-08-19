export const BROWSER_ADDRESS_HISTORY_STORAGE_KEY = "trace:browser-address-history";
const MAX_BROWSER_ADDRESS_HISTORY_ITEMS = 50;

type BrowserAddressHistoryStorage = Pick<Storage, "getItem" | "setItem">;

export function readBrowserAddressHistory(storage: Pick<Storage, "getItem">): string[] {
  try {
    const saved = JSON.parse(
      storage.getItem(BROWSER_ADDRESS_HISTORY_STORAGE_KEY) ?? "[]",
    ) as unknown;
    if (!Array.isArray(saved)) return [];
    const history: string[] = [];
    const remembered = new Set<string>();
    for (const value of saved) {
      if (typeof value !== "string") continue;
      const address = sanitizeBrowserAddressHistoryEntry(value);
      if (!address || remembered.has(address)) continue;
      history.push(address);
      remembered.add(address);
      if (history.length === MAX_BROWSER_ADDRESS_HISTORY_ITEMS) break;
    }
    return history;
  } catch {
    return [];
  }
}

export function rememberBrowserAddress(history: string[], address: string): string[] {
  const sanitizedAddress = sanitizeBrowserAddressHistoryEntry(address);
  if (!sanitizedAddress) return history;
  const remembered = new Set([sanitizedAddress]);
  const sanitizedHistory = [sanitizedAddress];
  for (const entry of history) {
    const sanitizedEntry = sanitizeBrowserAddressHistoryEntry(entry);
    if (!sanitizedEntry || remembered.has(sanitizedEntry)) continue;
    sanitizedHistory.push(sanitizedEntry);
    remembered.add(sanitizedEntry);
    if (sanitizedHistory.length === MAX_BROWSER_ADDRESS_HISTORY_ITEMS) break;
  }
  return sanitizedHistory;
}

export function saveBrowserAddressHistory(
  storage: BrowserAddressHistoryStorage,
  history: string[],
) {
  try {
    storage.setItem(BROWSER_ADDRESS_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // History is a convenience; a full or unavailable storage should not block navigation.
  }
}

export function sanitizeBrowserAddressHistoryEntry(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
