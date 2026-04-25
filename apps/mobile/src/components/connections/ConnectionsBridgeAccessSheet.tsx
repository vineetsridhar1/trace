import type { BridgeAccessCapability } from "@trace/gql";
import { SessionComposerBottomSheet } from "@/components/sessions/session-input-composer/SessionComposerBottomSheet";
import type { ConnectionAccessGrant, ConnectionAccessRequest } from "@/hooks/useConnections";
import { ConnectionsBridgeAccessGrantContent } from "./ConnectionsBridgeAccessGrantContent";
import { ConnectionsBridgeAccessRequestContent } from "./ConnectionsBridgeAccessRequestContent";

export function ConnectionsBridgeAccessSheet({
  request,
  grant,
  visible,
  pending,
  onClose,
  onApprove,
  onDeny,
  onRevoke,
  onUpdate,
}: {
  request: ConnectionAccessRequest | null;
  grant: ConnectionAccessGrant | null;
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
  onRevoke: (grant: ConnectionAccessGrant) => void;
  onUpdate: (grant: ConnectionAccessGrant, capabilities: BridgeAccessCapability[]) => void;
}) {
  return (
    <SessionComposerBottomSheet visible={visible} onClose={onClose}>
      {request ? (
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
