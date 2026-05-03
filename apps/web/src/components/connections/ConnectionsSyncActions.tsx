import { useCallback, useState } from "react";
import { Pause, Play, RotateCcw, RefreshCw } from "lucide-react";
import {
  RESTORE_LINKED_CHECKOUT_MUTATION,
  SET_LINKED_CHECKOUT_AUTO_SYNC_MUTATION,
  SYNC_LINKED_CHECKOUT_MUTATION,
} from "@trace/client-core";
import type { LinkedCheckoutActionResult } from "@trace/gql";
import { Button } from "../ui/button";
import { client } from "../../lib/urql";
import type { ConnectionLinkedCheckout } from "../../hooks/useConnections";

type Action = "sync" | "toggle" | "restore";

export function ConnectionsSyncActions({
  checkout,
  runtimeInstanceId,
  onChanged,
}: {
  checkout: ConnectionLinkedCheckout;
  runtimeInstanceId: string;
  onChanged: () => Promise<void>;
}) {
  const [pending, setPending] = useState<Action | null>(null);
  const sessionGroupId = checkout.attachedSessionGroupId;
  const branch =
    checkout.targetBranch ??
    checkout.attachedSessionGroup?.branch ??
    checkout.currentBranch ??
    null;
  const disabled = !sessionGroupId || pending !== null;

  const run = useCallback(
    async (action: Action, perform: () => Promise<LinkedCheckoutActionResult | null>) => {
      if (pending) return;
      setPending(action);
      try {
        const payload = await perform();
        if (!payload?.ok && payload?.error)
          console.warn("[connections] sync action failed", payload.error);
        await onChanged();
      } finally {
        setPending(null);
      }
    },
    [onChanged, pending],
  );

  const sync = () => {
    if (!sessionGroupId || !branch) return;
    void run("sync", async () => {
      const result = await client
        .mutation(SYNC_LINKED_CHECKOUT_MUTATION, {
          sessionGroupId,
          repoId: checkout.repoId,
          branch,
          runtimeInstanceId,
          autoSyncEnabled: true,
        })
        .toPromise();
      if (result.error) throw result.error;
      return result.data?.syncLinkedCheckout as LinkedCheckoutActionResult | null;
    });
  };

  const toggle = () => {
    if (!sessionGroupId) return;
    void run("toggle", async () => {
      const result = await client
        .mutation(SET_LINKED_CHECKOUT_AUTO_SYNC_MUTATION, {
          sessionGroupId,
          repoId: checkout.repoId,
          runtimeInstanceId,
          enabled: !checkout.autoSyncEnabled,
        })
        .toPromise();
      if (result.error) throw result.error;
      return result.data?.setLinkedCheckoutAutoSync as LinkedCheckoutActionResult | null;
    });
  };

  const restore = () => {
    if (!sessionGroupId) return;
    void run("restore", async () => {
      const result = await client
        .mutation(RESTORE_LINKED_CHECKOUT_MUTATION, {
          sessionGroupId,
          repoId: checkout.repoId,
          runtimeInstanceId,
        })
        .toPromise();
      if (result.error) throw result.error;
      return result.data?.restoreLinkedCheckout as LinkedCheckoutActionResult | null;
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" disabled={disabled || !branch} onClick={sync}>
        <RefreshCw size={14} />
        Resync
      </Button>
      <Button size="sm" variant="secondary" disabled={disabled} onClick={toggle}>
        {checkout.autoSyncEnabled ? <Pause size={14} /> : <Play size={14} />}
        {checkout.autoSyncEnabled ? "Pause" : "Resume"}
      </Button>
      <Button size="sm" variant="secondary" disabled={disabled} onClick={restore}>
        <RotateCcw size={14} />
        Restore
      </Button>
      {pending && <span className="text-xs text-muted-foreground">Working...</span>}
    </div>
  );
}
