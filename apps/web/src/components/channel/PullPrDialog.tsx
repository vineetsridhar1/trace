import { GitPullRequest, Search } from "lucide-react";
import type { Repo } from "@trace/gql";
import { useEntityField } from "@trace/client-core";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { PullPrRow } from "./PullPrRow";
import { usePullPrDialog } from "./usePullPrDialog";

export function PullPrDialog({ channelId }: { channelId: string }) {
  const channelRepo = useEntityField("channels", channelId, "repo") as Repo | null | undefined;
  const repoId = channelRepo?.id;
  const state = usePullPrDialog({ channelId, repoId });

  return (
    <Dialog open={state.open} onOpenChange={state.setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            disabled={!repoId}
            className="h-7 gap-1.5 text-muted-foreground hover:text-foreground"
          />
        }
      >
        <GitPullRequest size={14} />
        Pull PR
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pull PR</DialogTitle>
          <DialogDescription>
            Open a local Trace session for an open pull request branch.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={state.query}
            onChange={(event) => state.setQuery(event.target.value)}
            placeholder="Search PRs by title, author, number, or branch"
            className="pl-8"
          />
        </div>

        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {state.loading ? (
            Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="rounded-lg border border-border p-3">
                <Skeleton className="mb-2 h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))
          ) : state.filteredPullRequests.length > 0 ? (
            state.filteredPullRequests.map((pullRequest) => (
              <PullPrRow
                key={pullRequest.number}
                pullRequest={pullRequest}
                disabled={state.pendingBranch !== null}
                onPull={state.pullPullRequest}
              />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {repoId ? "No open pull requests found." : "This channel has no linked repo."}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
