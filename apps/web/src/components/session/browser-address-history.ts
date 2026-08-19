export const BROWSER_ADDRESS_HISTORY_STORAGE_KEY = "trace:browser-address-history";
const MAX_BROWSER_ADDRESS_HISTORY_ITEMS = 50;

type BrowserAddressHistoryStorage = Pick<Storage, "getItem" | "setItem">;

export function readBrowserAddressHistory(storage: Pick<Storage, "getItem">): string[] {
  try {
    const saved = JSON.parse(
      storage.getItem(BROWSER_ADDRESS_HISTORY_STORAGE_KEY) ?? "[]",
    ) as unknown;
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((value): value is string => typeof value === "string" && isRememberedAddress(value))
      .slice(0, MAX_BROWSER_ADDRESS_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

export function rememberBrowserAddress(history: string[], address: string): string[] {
  if (!isRememberedAddress(address)) return history;
  const normalizedAddress = address.trim();
  return [normalizedAddress, ...history.filter((entry) => entry !== normalizedAddress)].slice(
    0,
    MAX_BROWSER_ADDRESS_HISTORY_ITEMS,
  );
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

function isRememberedAddress(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed !== "about:blank";
}
