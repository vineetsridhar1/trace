import { useCallback, useRef, useState } from "react";
import { ListChecks } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TicketDetailPanel } from "../tickets/TicketDetailPanel";
import { ProjectTicketRow } from "./ProjectTicketRow";
import { useProjectTicketIds } from "./useProjectTicketIds";

const ROW_HEIGHT = 52;

export function ProjectTicketList({ projectId }: { projectId: string }) {
  const ticketIds = useProjectTicketIds(projectId);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: ticketIds.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  const handleSelect = useCallback((ticketId: string) => {
    setSelectedTicketId((current) => (current === ticketId ? null : ticketId));
  }, []);

  return (
    <section className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <ListChecks size={15} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Tickets</h2>
        <span className="ml-auto text-xs text-muted-foreground">{ticketIds.length}</span>
      </div>

      {ticketIds.length === 0 ? (
        <div className="flex min-h-[180px] flex-1 items-center justify-center px-5 text-center">
          <p className="max-w-xs text-sm text-muted-foreground">
            Approve the plan to start ticket generation. Generated and manually linked tickets will
            appear here from service-created events.
          </p>
        </div>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const ticketId = ticketIds[virtualRow.index];
              if (!ticketId) return null;
              return (
                <div
                  key={ticketId}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <ProjectTicketRow
                    ticketId={ticketId}
                    selected={selectedTicketId === ticketId}
                    onSelect={handleSelect}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <TicketDetailPanel ticketId={selectedTicketId} onClose={() => setSelectedTicketId(null)} />
    </section>
  );
}
