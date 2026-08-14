import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import { Button } from "../ui/button";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogTrigger as DialogTrigger,
} from "../ui/responsive-dialog";
import { AddPeopleDialog } from "./AddPeopleDialog";
import { PersonAvatar } from "./PersonAvatar";
import { PersonIdentity } from "./PersonIdentity";
import { useChannelPeople } from "./useChannelPeople";

export function ChannelMembersDialog({
  channelId,
  open: controlledOpen,
  onOpenChange: onControlledOpenChange,
}: {
  channelId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onControlledOpenChange ?? setUncontrolledOpen;
  const [addOpen, setAddOpen] = useState(false);
  const channelName = useEntityField("channels", channelId, "name");
  const { channelMembers, refresh } = useChannelPeople(channelId, open);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {controlledOpen === undefined && (
          <DialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="View members"
              />
            }
          >
            <Users size={15} />
          </DialogTrigger>
        )}
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-10">
              <DialogTitle>Members</DialogTitle>
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setAddOpen(true)}
              >
                <Plus size={14} />
                Add people
              </Button>
            </div>
          </DialogHeader>

          <div className="max-h-64 space-y-px overflow-y-auto py-2">
            {channelMembers.map((member) => (
              <div key={member.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                <PersonAvatar name={member.name} avatarUrl={member.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">{member.name}</p>
                  <PersonIdentity email={member.email} />
                </div>
              </div>
            ))}
            {channelMembers.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">No members</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AddPeopleDialog
        channelId={channelId}
        channelName={channelName ?? "this project"}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => void refresh()}
      />
    </>
  );
}
