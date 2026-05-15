import { useState } from "react";
import { Check, X } from "lucide-react";
import { asJsonObject } from "@trace/shared";
import {
  APPROVE_SUGGESTED_ACTION_MUTATION,
  DISMISS_SUGGESTED_ACTION_MUTATION,
  useEntityField,
} from "@trace/client-core";
import { client } from "../../../lib/urql";
import { Button } from "../../ui/button";
import { cn } from "../../../lib/utils";

type SuggestedActionCardProps = {
  suggestedActionId: string;
  initialSuggestedAction: Record<string, unknown>;
};

function actionTitle(
  actionType: string,
  targetId: string | null,
  input: Record<string, unknown> | null,
): string {
  if (actionType === "send_session_message") return `Send message to ${targetId ?? "session"}`;
  if (actionType === "create_session") {
    return typeof input?.title === "string" && input.title.trim() ? input.title : "Create session";
  }
  return "Suggested action";
}

function actionBody(actionType: string, input: Record<string, unknown> | null): string {
  if (actionType === "send_session_message" && typeof input?.body === "string") {
    return input.body;
  }
  if (actionType === "create_session" && typeof input?.prompt === "string") {
    return input.prompt;
  }
  return JSON.stringify(input ?? {}, null, 2);
}

export function SuggestedActionCard({
  suggestedActionId,
  initialSuggestedAction,
}: SuggestedActionCardProps) {
  const [busy, setBusy] = useState<"approve" | "dismiss" | null>(null);
  const storedStatus = useEntityField("suggestedActions", suggestedActionId, "status") as
    | string
    | undefined;
  const storedActionType = useEntityField("suggestedActions", suggestedActionId, "actionType") as
    | string
    | undefined;
  const storedTargetId = useEntityField("suggestedActions", suggestedActionId, "targetId") as
    | string
    | null
    | undefined;
  const storedRationale = useEntityField("suggestedActions", suggestedActionId, "rationale") as
    | string
    | null
    | undefined;
  const storedInput = useEntityField("suggestedActions", suggestedActionId, "input");

  const status = storedStatus ?? (typeof initialSuggestedAction.status === "string" ? initialSuggestedAction.status : "pending");
  const actionType =
    storedActionType ??
    (typeof initialSuggestedAction.actionType === "string"
      ? initialSuggestedAction.actionType
      : "unknown");
  const targetId =
    storedTargetId ??
    (typeof initialSuggestedAction.targetId === "string" ? initialSuggestedAction.targetId : null);
  const rationale =
    storedRationale ??
    (typeof initialSuggestedAction.rationale === "string" ? initialSuggestedAction.rationale : null);
  const input = asJsonObject(storedInput ?? initialSuggestedAction.input);
  const pending = status === "pending";

  async function approve() {
    setBusy("approve");
    try {
      await client.mutation(APPROVE_SUGGESTED_ACTION_MUTATION, { id: suggestedActionId }).toPromise();
    } finally {
      setBusy(null);
    }
  }

  async function dismiss() {
    setBusy("dismiss");
    try {
      await client.mutation(DISMISS_SUGGESTED_ACTION_MUTATION, { id: suggestedActionId }).toPromise();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto my-2 w-full max-w-3xl rounded-lg border border-border bg-surface-deep p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Suggested action
          </div>
          <div className="mt-1 text-sm font-medium text-foreground">
            {actionTitle(actionType, targetId, input ?? null)}
          </div>
        </div>
        <div
          className={cn(
            "rounded-md border px-2 py-1 text-xs",
            pending
              ? "border-primary/30 text-primary"
              : status === "approved"
                ? "border-emerald-500/30 text-emerald-600"
                : "border-muted-foreground/30 text-muted-foreground",
          )}
        >
          {status}
        </div>
      </div>
      <div className="mt-3 whitespace-pre-wrap rounded-md bg-background px-3 py-2 text-sm leading-6 text-foreground">
        {actionBody(actionType, input ?? null)}
      </div>
      {rationale ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{rationale}</p> : null}
      {pending ? (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={dismiss} disabled={busy !== null}>
            <X className="size-3.5" />
            Dismiss
          </Button>
          <Button size="sm" onClick={approve} disabled={busy !== null}>
            <Check className="size-3.5" />
            Approve
          </Button>
        </div>
      ) : null}
    </div>
  );
}
