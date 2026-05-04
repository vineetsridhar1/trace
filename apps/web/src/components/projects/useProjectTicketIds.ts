import { useEntityStore } from "@trace/client-core";
import { useShallow } from "zustand/react/shallow";

export function useProjectTicketIds(projectId: string): string[] {
  return useEntityStore(
    useShallow((state) =>
      Object.values(state.tickets)
        .filter((ticket) => ticket.projects?.some((project) => project.id === projectId))
        .sort((a, b) => {
          const statusDiff = statusRank(a.status) - statusRank(b.status);
          if (statusDiff !== 0) return statusDiff;
          const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          if (timeDiff !== 0) return timeDiff;
          return a.id.localeCompare(b.id);
        })
        .map((ticket) => ticket.id),
    ),
  );
}

function statusRank(status: string): number {
  switch (status) {
    case "backlog":
      return 0;
    case "todo":
      return 1;
    case "in_progress":
      return 2;
    case "in_review":
      return 3;
    case "done":
      return 4;
    case "cancelled":
      return 5;
    default:
      return 99;
  }
}
