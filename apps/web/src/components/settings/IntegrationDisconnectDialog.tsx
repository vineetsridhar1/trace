import type { IntegrationConnection } from "@trace/gql";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

export function IntegrationDisconnectDialog({
  connection,
  onConfirm,
  onOpenChange,
  pending,
}: {
  connection: IntegrationConnection | null;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
}) {
  return (
    <Dialog open={connection !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disconnect {connection?.displayName}?</DialogTitle>
          <DialogDescription>
            Existing apps using this connection will stop working until another connection is
            selected.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? "Disconnecting" : "Disconnect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
