import type {
  IntegrationConnection,
  IntegrationConnectionKind,
  SupportedAppIntegration,
} from "@trace/gql";
import { Building2, UserRound } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { integrationConnectAvailability } from "./integration-connect-availability";

export function IntegrationConnectDialog({
  canCreateService,
  connections,
  currentUserId,
  integration,
  onConnect,
  onOpenChange,
  open,
  pending,
}: {
  canCreateService: boolean;
  connections: IntegrationConnection[];
  currentUserId: string | null;
  integration: SupportedAppIntegration | null;
  onConnect: (kind: IntegrationConnectionKind) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
}) {
  if (!integration) return null;

  const { personalAvailable, serviceAvailable } = integrationConnectAvailability(
    connections,
    currentUserId,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect {integration.name}</DialogTitle>
          <DialogDescription>
            Choose who this connection belongs to. You can change how individual apps use it later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Button
            className="h-auto justify-start gap-3 px-3 py-3 text-left"
            variant="outline"
            disabled={pending || !personalAvailable}
            onClick={() => onConnect("personal")}
          >
            <UserRound className="size-5 shrink-0" />
            <span className="min-w-0">
              <span className="block font-medium">Personal connection</span>
              <span className="block whitespace-normal text-xs font-normal text-muted-foreground">
                {!personalAvailable
                  ? `You already connected a personal ${integration.name} account.`
                  : "Available only to you and apps you explicitly authorize."}
              </span>
            </span>
          </Button>

          {canCreateService ? (
            <Button
              className="h-auto justify-start gap-3 px-3 py-3 text-left"
              variant="outline"
              disabled={pending || !serviceAvailable}
              onClick={() => onConnect("service")}
            >
              <Building2 className="size-5 shrink-0" />
              <span className="min-w-0">
                <span className="block font-medium">Organization service account</span>
                <span className="block whitespace-normal text-xs font-normal text-muted-foreground">
                  {!serviceAvailable
                    ? `Your organization already has a ${integration.name} service account.`
                    : "Shared organization identity managed by administrators."}
                </span>
              </span>
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
