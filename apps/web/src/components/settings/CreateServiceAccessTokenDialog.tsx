import { Plus } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { ServiceTokenPermissionPicker } from "./ServiceTokenPermissionPicker";
import { ServiceTokenSecretView } from "./ServiceTokenSecretView";
import { useCreateServiceAccessToken } from "./useCreateServiceAccessToken";

export function CreateServiceAccessTokenDialog({ organizationId }: { organizationId: string }) {
  const state = useCreateServiceAccessToken(organizationId);

  return (
    <Dialog open={state.open} onOpenChange={state.handleOpenChange}>
      <DialogTrigger render={<Button type="button" size="sm" />}>
        <Plus size={14} />
        Create token
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {state.rawToken ? "Copy your service token" : "Create service token"}
          </DialogTitle>
          <DialogDescription>
            {state.rawToken
              ? "This secret is shown once. Store it securely before closing."
              : "Create an organization-scoped credential for an internal service."}
          </DialogDescription>
        </DialogHeader>

        {state.rawToken ? (
          <ServiceTokenSecretView
            rawToken={state.rawToken}
            copied={state.copied}
            onCopy={() => void state.copyToken()}
          />
        ) : (
          <div className="space-y-4 py-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Name</span>
              <Input
                value={state.name}
                onChange={(event) => state.setName(event.target.value)}
                placeholder="deployment-daemon"
                maxLength={120}
                autoFocus
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Expiration</span>
              <Select
                value={state.expirationDays}
                onValueChange={(value) => state.setExpirationDays(value ?? "90")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">180 days</SelectItem>
                  <SelectItem value="365">365 days</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <ServiceTokenPermissionPicker scopes={state.scopes} onToggle={state.toggleScope} />

            {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          </div>
        )}

        <DialogFooter>
          {state.rawToken ? (
            <Button type="button" onClick={() => state.handleOpenChange(false)}>
              Done
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void state.createToken()}
              disabled={!state.name.trim() || state.scopes.length === 0 || state.creating}
            >
              {state.creating ? "Creating…" : "Create token"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
