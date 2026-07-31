import { Search } from "lucide-react";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { getInitials } from "../../lib/utils";

interface HeaderPerson {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export function HomeHeader({ people, title = "Home" }: { people: HeaderPerson[]; title?: string }) {
  const currentUser = useAuthStore((state: AuthState) => state.user);
  const setPaletteOpen = useCommandPaletteStore((state) => state.setPaletteOpen);
  const team = uniquePeople(currentUser ? [currentUser, ...people] : people).slice(0, 4);

  return (
    <header className="app-region-drag flex h-12 shrink-0 items-center border-b border-[var(--th-edge)] pl-[var(--trace-header-title-offset)] pr-3 transition-[padding-left] duration-200 ease-in-out sm:pr-4">
      <span className="hidden text-sm font-semibold text-[var(--th-heading)] md:inline">
        {title}
      </span>
      <span className="ml-3 hidden text-xs text-[var(--th-faint)] lg:inline">
        {new Intl.DateTimeFormat(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        }).format(new Date())}
      </span>
      <div className="app-region-no-drag ml-auto flex items-center gap-3">
        <button
          type="button"
          aria-label="Search Trace"
          onClick={() => setPaletteOpen(true)}
          className="flex h-7 items-center gap-2 rounded-md border border-[var(--th-edge)] bg-[var(--th-surface)] px-2 text-xs text-[var(--th-muted)] transition-colors hover:border-[var(--th-edge-hover)] hover:text-[var(--th-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--th-accent-light)] sm:w-48"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="hidden min-w-0 flex-1 text-left sm:inline">Search Trace</span>
          <kbd className="hidden rounded border border-[var(--th-edge)] bg-[var(--th-surface-mid)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--th-faint)] sm:inline">
            ⌘K
          </kbd>
        </button>
        <div className="hidden items-center sm:flex">
          {team.map((person, index) => (
            <span
              key={person.id}
              title={person.name}
              className="relative flex size-6 items-center justify-center overflow-hidden rounded-full bg-[var(--th-surface-elevated)] text-[9px] font-semibold text-foreground ring-2 ring-[var(--th-surface-mid)]"
              style={{ marginLeft: index === 0 ? 0 : -8, zIndex: team.length - index }}
            >
              {person.avatarUrl ? (
                <img src={person.avatarUrl} alt={person.name} className="size-full object-cover" />
              ) : (
                getInitials(person.name)
              )}
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}

function uniquePeople(people: HeaderPerson[]): HeaderPerson[] {
  const unique = new Map<string, HeaderPerson>();
  for (const person of people) unique.set(person.id, person);
  return [...unique.values()];
}
