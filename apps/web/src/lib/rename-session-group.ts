import { RENAME_SESSION_GROUP_MUTATION } from "@trace/client-core";
import { toast } from "sonner";
import { client } from "./urql";
import { applyOptimisticPatch } from "./optimistic-entity";

export async function renameSessionGroup(id: string, name: string) {
  const rollback = applyOptimisticPatch("sessionGroups", id, { name });
  try {
    const result = await client.mutation(RENAME_SESSION_GROUP_MUTATION, { id, name }).toPromise();
    if (result.error) throw result.error;
  } catch (error: unknown) {
    rollback();
    toast.error("Failed to rename workspace", {
      description: error instanceof Error ? error.message : "Please try again.",
    });
  }
}
