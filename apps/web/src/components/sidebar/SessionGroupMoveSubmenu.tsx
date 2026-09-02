import { FolderInput } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  MOVE_SESSION_GROUP_MUTATION,
  useEntityField,
  useEntityStore,
  type EntityTableMap,
} from "@trace/client-core";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "../ui/context-menu";

type ChannelTable = Record<string, EntityTableMap["channels"]>;

export function compatibleSessionGroupDestinationIds(
  channels: ChannelTable,
  sourceChannelId: string,
): string[] {
  const source = channels[sourceChannelId];
  const sourceRepoId = source?.repo?.id;
  if (!sourceRepoId) return [];

  return Object.values(channels)
    .filter(
      (channel) =>
        channel.id !== sourceChannelId &&
        channel.viewerIsMember &&
        channel.repo?.id === sourceRepoId &&
        channel.baseBranch === source.baseBranch,
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((channel) => channel.id);
}

export function SessionGroupMoveSubmenu({
  sessionGroupId,
  sourceChannelId,
}: {
  sessionGroupId: string;
  sourceChannelId: string;
}) {
  const destinationIds = useEntityStore(
    useShallow((state) =>
      compatibleSessionGroupDestinationIds(state.channels, sourceChannelId),
    ),
  );
  if (destinationIds.length === 0) return null;

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <FolderInput size={14} className="mr-1.5" />
        Move to project
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-56">
        {destinationIds.map((destinationChannelId) => (
          <SessionGroupMoveDestination
            key={destinationChannelId}
            destinationChannelId={destinationChannelId}
            sessionGroupId={sessionGroupId}
          />
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

function SessionGroupMoveDestination({
  destinationChannelId,
  sessionGroupId,
}: {
  destinationChannelId: string;
  sessionGroupId: string;
}) {
  const name = useEntityField("channels", destinationChannelId, "name");

  return (
    <ContextMenuItem
      onClick={() => {
        void client
          .mutation(MOVE_SESSION_GROUP_MUTATION, {
            id: sessionGroupId,
            destinationChannelId,
          })
          .toPromise()
          .then((result) => {
            if (result.error) {
              toast.error("Failed to move workspace", { description: result.error.message });
            }
          })
          .catch((error: unknown) => {
            toast.error("Failed to move workspace", {
              description: error instanceof Error ? error.message : "Please try again.",
            });
          });
      }}
    >
      {name}
    </ContextMenuItem>
  );
}
