import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { gql } from "@urql/core";
import { toast } from "sonner";
import { useAuthStore } from "@trace/client-core";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "../ui/responsive-dialog";
import { AddPeopleEmptyState } from "./AddPeopleEmptyState";
import { AddPeopleList } from "./AddPeopleList";
import { useChannelPeople, type ChannelPerson } from "./useChannelPeople";

const ADD_CHANNEL_MEMBER_MUTATION = gql`
  mutation AddChannelMember($input: AddChannelMemberInput!) {
    addChannelMember(input: $input) {
      id
    }
  }
`;

function matchesQuery(person: ChannelPerson, query: string): boolean {
  if (!query) return true;
  const term = query.toLowerCase();
  return person.name.toLowerCase().includes(term) || person.email.toLowerCase().includes(term);
}

export function AddPeopleDialog({
  channelId,
  channelName,
  open,
  onOpenChange,
  onAdded,
}: {
  channelId: string;
  channelName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [adding, setAdding] = useState(false);
  const userId = useAuthStore((s) => s.user?.id);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const orgName = useAuthStore(
    (s) =>
      s.orgMemberships.find((membership) => membership.organizationId === s.activeOrgId)
        ?.organization.name ?? "this workspace",
  );
  const { orgMembers, channelMembers, refresh } = useChannelPeople(channelId, open);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIds(new Set());
  }, [open, activeOrgId]);

  const memberIds = useMemo(
    () => new Set(channelMembers.map((member) => member.id)),
    [channelMembers],
  );
  const available = useMemo(
    () =>
      orgMembers.filter(
        (person) => person.id !== userId && !memberIds.has(person.id) && matchesQuery(person, query),
      ),
    [memberIds, orgMembers, query, userId],
  );
  const existing = useMemo(
    () => channelMembers.filter((person) => matchesQuery(person, query)),
    [channelMembers, query],
  );

  const count = selectedIds.size;
  const trimmedQuery = query.trim();
  const showEmptyState = available.length === 0 && existing.length === 0 && trimmedQuery !== "";
  const allAdded = available.length === 0 && trimmedQuery === "";

  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    setAdding(true);
    try {
      const results = await Promise.all(
        [...selectedIds].map((targetUserId) =>
          client
            .mutation(ADD_CHANNEL_MEMBER_MUTATION, { input: { channelId, userId: targetUserId } })
            .toPromise(),
        ),
      );
      const failure = results.find((result) => result.error);
      if (failure?.error) {
        toast.error("Couldn't add everyone", { description: failure.error.message });
        return;
      }
      await refresh();
      onAdded?.();
      onOpenChange(false);
    } finally {
      setAdding(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add people</DialogTitle>
          <DialogDescription>
            Choose workspace members to give access to {channelName}.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 max-h-[55dvh] overflow-y-auto">
          <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-muted-foreground focus-within:border-ring">
            <Search size={14} className="shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search workspace members"
              aria-label="Search workspace members"
              className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70"
            />
          </label>

          {showEmptyState ? (
            <AddPeopleEmptyState query={trimmedQuery} orgName={orgName} />
          ) : (
            <>
              {allAdded && (
                <p className="px-2 pt-4 text-xs text-muted-foreground">
                  Everyone in this workspace is already on the project.
                </p>
              )}
              <AddPeopleList
                available={available}
                existing={existing}
                selectedIds={selectedIds}
                onToggle={toggle}
              />
            </>
          )}
        </div>

        <div className="-mx-4 -mb-4 flex items-center justify-between gap-3 rounded-b-xl border-t bg-muted/50 p-4">
          <span className="text-xs text-muted-foreground">
            {count === 0 ? "No one selected" : `${count} selected`}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={count === 0 || adding} onClick={() => void handleAdd()}>
              {count === 0
                ? "Add people"
                : `Add ${count} ${count === 1 ? "person" : "people"}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
