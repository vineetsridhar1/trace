import type { BridgeAccessCapability } from "@trace/gql";
import { SessionComposerBottomSheet } from "@/components/sessions/session-input-composer/SessionComposerBottomSheet";
import type { ConnectionAccessGrant, ConnectionAccessRequest } from "@/hooks/useConnections";
import { ConnectionsBridgeAccessGrantContent } from "./ConnectionsBridgeAccessGrantContent";
import { ConnectionsBridgeAccessQuickReviewContent } from "./ConnectionsBridgeAccessQuickReviewContent";
import { ConnectionsBridgeAccessRequestContent } from "./ConnectionsBridgeAccessRequestContent";

export type ConnectionsBridgeAccessRequestMode = "quick" | "configure";

export function ConnectionsBridgeAccessSheet({
  request,
  grant,
  requestMode,
  visible,
  pending,
  onClose,
  onApprove,
  onDeny,
  onConfigure,
  onRevoke,
  onUpdate,
}: {
  request: ConnectionAccessRequest | null;
  grant: ConnectionAccessGrant | null;
  requestMode: ConnectionsBridgeAccessRequestMode;
  visible: boolean;
  pending: boolean;
  onClose: () => void;
  onApprove: (input: {
    requestId: string;
    scopeType: "all_sessions" | "session_group";
    sessionGroupId?: string | null;
    expiresAt?: string;
    capabilities: BridgeAccessCapability[];
  }) => void;
  onDeny: (request: ConnectionAccessRequest) => void;
  onConfigure: () => void;
  onRevoke: (grant: ConnectionAccessGrant) => void;
  onUpdate: (grant: ConnectionAccessGrant, capabilities: BridgeAccessCapability[]) => void;
}) {
  return (
    <SessionComposerBottomSheet visible={visible} onClose={onClose}>
      {request && requestMode === "quick" ? (
        <ConnectionsBridgeAccessQuickReviewContent
          request={request}
          pending={pending}
          onApprove={onApprove}
          onDeny={onDeny}
          onConfigure={onConfigure}
        />
      ) : null}
      {request && requestMode === "configure" ? (
        <ConnectionsBridgeAccessRequestContent
          request={request}
          pending={pending}
          onApprove={onApprove}
          onDeny={onDeny}
        />
      ) : null}
      {grant ? (
        <ConnectionsBridgeAccessGrantContent
          grant={grant}
          pending={pending}
          onRevoke={onRevoke}
          onUpdate={onUpdate}
        />
      ) : null}
    </SessionComposerBottomSheet>
  );
}
