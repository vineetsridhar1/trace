import { FiClock } from 'react-icons/fi';
import { useTicketDependenciesQuery } from './__generated__/TicketView.generated';

export function QueuedStatusBar({ messageId }: { messageId: string }) {
  const { data } = useTicketDependenciesQuery({ variables: { messageId } });
  const deps = data?.ticketDependencies ?? [];

  const depNames = deps
    .map((d) => d.dependsOnTicketTitle ?? d.dependsOnMessageId)
    .filter(Boolean);

  return (
    <div className="flex items-center gap-2 border-t border-[#292e42] bg-cyan-500/5 px-4 py-3">
      <FiClock className="h-4 w-4 shrink-0 text-cyan-400" />
      <span className="text-sm text-cyan-300">
        {depNames.length > 0
          ? <>Queued — will automatically run after {deps.map((dep, i) => (
              <span key={dep.id}>
                {i > 0 && (i === depNames.length - 1 ? ' and ' : ', ')}
                <strong>{dep.dependsOnTicketTitle ?? dep.dependsOnMessageId}</strong>
              </span>
            ))} {depNames.length === 1 ? 'is' : 'are'} merged.</>
          : 'Queued — waiting on dependencies to be merged.'}
      </span>
    </div>
  );
}
