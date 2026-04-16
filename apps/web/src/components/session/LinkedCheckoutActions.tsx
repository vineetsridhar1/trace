import { Button } from "../ui/button";
import type { LinkedCheckoutHeaderState } from "./useLinkedCheckoutHeaderState";

interface Props {
  state: LinkedCheckoutHeaderState;
}

export function LinkedCheckoutActions({ state }: Props) {
  if (!state.canShowControls) return null;

  const {
    isAttachedToThisGroup,
    pending,
    autoSyncEnabled,
    requiresRepoLink,
    onLinkRepo,
    onSync,
    onRestore,
    onToggleAutoSync,
  } = state;

  if (requiresRepoLink) {
    return (
      <Button variant="outline" size="sm" onClick={onLinkRepo} disabled={pending}>
        {pending ? "Linking..." : "Link Local Checkout"}
      </Button>
    );
  }

  return (
    <>
      <Button
        variant={isAttachedToThisGroup ? "secondary" : "outline"}
        size="sm"
        onClick={onSync}
        disabled={pending}
      >
        {pending ? "Syncing..." : "Sync To Main Worktree"}
      </Button>

      {isAttachedToThisGroup && (
        <>
          <Button variant="ghost" size="sm" onClick={onToggleAutoSync} disabled={pending}>
            {autoSyncEnabled ? "Pause Auto-Sync" : "Resume Auto-Sync"}
          </Button>
          <Button variant="outline" size="sm" onClick={onRestore} disabled={pending}>
            Restore My Checkout
          </Button>
        </>
      )}
    </>
  );
}
