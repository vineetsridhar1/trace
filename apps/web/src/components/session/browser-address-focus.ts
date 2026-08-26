export const BROWSER_ADDRESS_FOCUS_EVENT = "trace:focus-browser-address";

export function requestBrowserAddressFocus(browserId: string): void {
  window.dispatchEvent(new CustomEvent<string>(BROWSER_ADDRESS_FOCUS_EVENT, { detail: browserId }));
}
