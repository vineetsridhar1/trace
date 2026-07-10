import { useEffect, useState } from "react";
import { gql } from "@urql/core";
import { client } from "@/lib/urql";
import { TraceLoader } from "@/components/ui/trace-loader";

const CREATE_PREVIEW_MUTATION = gql`
  mutation CreateSessionEndpointPreview($endpointId: ID!) {
    createSessionEndpointPreview(endpointId: $endpointId) {
      url
    }
  }
`;

export function AppPreview({ endpointId }: { endpointId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void client
      .mutation(CREATE_PREVIEW_MUTATION, { endpointId })
      .toPromise()
      .then((result) => {
        if (!active) return;
        if (result.error) setError(result.error.message);
        else setUrl(result.data?.createSessionEndpointPreview?.url ?? null);
      });
    return () => {
      active = false;
    };
  }, [endpointId]);

  if (error) return <p className="px-2 py-3 text-xs text-destructive">{error}</p>;
  if (!url) {
    return (
      <div className="flex aspect-video items-center justify-center">
        <TraceLoader size={14} showLabel={false} />
      </div>
    );
  }
  return (
    <iframe
      src={url}
      title="Live app preview"
      className="aspect-video w-full rounded-md border border-border bg-background"
      sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
    />
  );
}
