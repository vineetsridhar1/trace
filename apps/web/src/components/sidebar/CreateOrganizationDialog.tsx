import { useState } from "react";
import type { FormEvent, ReactElement } from "react";
import { Plus } from "lucide-react";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
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
      organizationId
      role
      joinedAt
      organization {
        id
        name
      }
    }
  }
`;

type CreatedOrgMembership = {
  organizationId: string;
};

export function CreateOrganizationDialog({ trigger }: { trigger?: ReactElement }) {
  const fetchMe = useAuthStore((s: AuthState) => s.fetchMe);
  const setActiveOrg = useAuthStore((s: AuthState) => s.setActiveOrg);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter an organization name.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await client
      .mutation(CREATE_ORGANIZATION, { input: { name: trimmedName } })
      .toPromise();

    if (result.error) {
      setSubmitting(false);
      setError(result.error.message);
      return;
    }

    const membership = result.data?.createOrganization as CreatedOrgMembership | undefined;
    await fetchMe();
    if (membership?.organizationId) {
      setActiveOrg(membership.organizationId);
    }

    setSubmitting(false);
    setName("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? <Button className="gap-2" />}>
        {trigger ? null : (
          <>
            <Plus size={14} />
            New organization
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
            <DialogDescription>
              Start a separate workspace for channels, sessions, tickets, and members.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="organization-name">
              Name
            </label>
            <Input
              id="organization-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme"
              disabled={submitting}
              autoFocus
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
