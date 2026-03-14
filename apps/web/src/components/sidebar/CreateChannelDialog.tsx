import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuthStore } from "../../stores/auth";
import { useEntityStore } from "../../stores/entity";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

const CREATE_CHANNEL_MUTATION = gql`
  mutation CreateChannel($input: CreateChannelInput!) {
    createChannel(input: $input) {
      id
      name
      type
    }
  }
`;

export function CreateChannelDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !activeOrgId) return;

    setCreating(true);
    try {
      const result = await client
        .mutation(CREATE_CHANNEL_MUTATION, {
          input: { organizationId: activeOrgId, name: name.trim() },
        })
        .toPromise();

      if (result.data?.createChannel) {
        const channel = result.data.createChannel;
        useEntityStore.getState().upsert("channels", channel.id, channel);
        setName("");
        setOpen(false);
        onCreated();
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="flex items-center justify-center rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        title="Create channel"
      >
        <Plus size={16} />
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleCreate}>
          <DialogHeader>
            <DialogTitle>Create Channel</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="mb-1.5 block text-sm text-muted-foreground">Channel name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. general"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || creating}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
