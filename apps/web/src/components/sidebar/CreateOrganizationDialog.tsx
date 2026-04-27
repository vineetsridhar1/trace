import { useState } from "react";
import type { FormEvent, ReactElement } from "react";
import { Plus } from "lucide-react";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";

const CREATE_ORGANIZATION = `
  mutation CreateOrganization($input: CreateOrganizationInput!) {
    createOrganization(input: $input) {
      organization {
        id
        name
      }
    }
  }
`;

type CreatedOrgMembership = {
  organization: {
    id: string;
  };
};

export function CreateOrganizationDialog({ trigger }: { trigger?: ReactElement }) {
  const fetchMe = useAuthStore((s: AuthState) => s.fetchMe);
  const setActiveOrg = useAuthStore((s: AuthState) => s.setActiveOrg);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = name.trim().length > 0 && !submitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter an organization name.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await client
        .mutation(CREATE_ORGANIZATION, { input: { name: trimmedName } })
        .toPromise();

      if (result.error) {
        setError(result.error.message);
        return;
      }

      const membership = result.data?.createOrganization as CreatedOrgMembership | undefined;
      await fetchMe();
      if (membership?.organization.id) {
        setActiveOrg(membership.organization.id);
      }

      setName("");
      setOpen(false);
    } catch {
      setError("Could not create the organization. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? <Button className="gap-2" />}>
        {trigger ? null : (
          <>
            <Plus size={14} />
            Create organization
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="text-lg">Create organization</DialogTitle>
            <DialogDescription className="max-w-sm">
              Name the workspace where your team will share channels, sessions, and tickets.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground" htmlFor="organization-name">
              Organization name
            </label>
            <Input
              id="organization-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme Labs"
              disabled={submitting}
              autoFocus
              className="h-9"
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>

          <DialogFooter className="flex-row justify-end gap-2 border-t bg-transparent pt-4">
            <DialogClose render={<Button type="button" variant="ghost" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? "Creating..." : "Create organization"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
