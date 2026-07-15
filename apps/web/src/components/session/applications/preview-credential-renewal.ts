export const PREVIEW_CREDENTIAL_RETRY_MS = 30_000;
const PREVIEW_CREDENTIAL_RENEWAL_MARGIN_MS = 60_000;

export function previewCredentialRenewAt(expiresAt: string, now = Date.now()): number {
  const expiration = Date.parse(expiresAt);
  return Number.isFinite(expiration)
    ? Math.max(now, expiration - PREVIEW_CREDENTIAL_RENEWAL_MARGIN_MS)
    : now + PREVIEW_CREDENTIAL_RETRY_MS;
}
