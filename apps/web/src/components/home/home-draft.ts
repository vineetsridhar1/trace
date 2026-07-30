export function readHomeDraft(organizationId: string | null): string {
  return localStorage.getItem(homeDraftKey(organizationId)) ?? "";
}

export function saveHomeDraft(organizationId: string | null, prompt: string): void {
  localStorage.setItem(homeDraftKey(organizationId), prompt);
}

export function clearHomeDraft(organizationId: string | null): void {
  localStorage.removeItem(homeDraftKey(organizationId));
}

export function isSubstantialPromptEdit(original: string, next: string): boolean {
  const difference = Math.abs(original.trim().length - next.trim().length);
  return difference >= Math.max(12, Math.round(original.trim().length * 0.35));
}

function homeDraftKey(organizationId: string | null): string {
  return `trace:home-composer:${organizationId ?? "default"}`;
}
