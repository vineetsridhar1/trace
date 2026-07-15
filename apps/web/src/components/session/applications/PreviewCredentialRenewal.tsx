import { useEffect, useState } from "react";
import { client } from "@/lib/urql";
import {
  PREVIEW_CREDENTIAL_RETRY_MS,
  previewCredentialRenewAt,
} from "./preview-credential-renewal";
import { CREATE_PREVIEW_MUTATION } from "./session-applications-operations";

type PreviewCredential = { url: string; expiresAt: string };

export function PreviewCredentialRenewal({
  endpointId,
  expiresAt,
}: {
  endpointId: string;
  expiresAt: string | null;
}) {
  const [renewAt, setRenewAt] = useState<number | null>(null);
  const [credential, setCredential] = useState<PreviewCredential | null>(null);

  useEffect(() => {
    setCredential(null);
    setRenewAt(expiresAt ? previewCredentialRenewAt(expiresAt) : null);
  }, [endpointId, expiresAt]);

  useEffect(() => {
    if (renewAt === null || credential) return;
    let active = true;
    const timeout = window.setTimeout(
      () => {
        void client
          .mutation(CREATE_PREVIEW_MUTATION, { endpointId })
          .toPromise()
          .then((result) => {
            if (!active) return;
            const nextUrl = result.data?.createSessionEndpointPreview?.url;
            const nextExpiresAt = result.data?.createSessionEndpointPreview?.expiresAt;
            if (result.error || !nextUrl || !nextExpiresAt) {
              setRenewAt(Date.now() + PREVIEW_CREDENTIAL_RETRY_MS);
              return;
            }
            setCredential({ url: nextUrl, expiresAt: nextExpiresAt });
          });
      },
      Math.max(0, renewAt - Date.now()),
    );
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [credential, endpointId, renewAt]);

  if (!credential) return null;
  return (
    <iframe
      src={credential.url}
      title="Refresh preview access"
      aria-hidden="true"
      className="hidden"
      sandbox="allow-same-origin allow-scripts"
      onLoad={() => {
        setRenewAt(previewCredentialRenewAt(credential.expiresAt));
        setCredential(null);
      }}
    />
  );
}
