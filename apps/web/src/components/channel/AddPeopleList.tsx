import { Check } from "lucide-react";
import { cn } from "../../lib/utils";
import { PersonAvatar } from "./PersonAvatar";
import { PersonIdentity } from "./PersonIdentity";
import type { ChannelPerson } from "./useChannelPeople";

function GroupLabel({ children }: { children: string }) {
  return (
    <p className="px-2 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
      {children}
    </p>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-transparent",
      )}
    >
      {checked && <Check size={11} strokeWidth={3} />}
    </span>
  );
}

function PickerRow({
  person,
  selected,
  onToggle,
}: {
  person: ChannelPerson;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={person.name}
      onClick={onToggle}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "bg-white/10" : "hover:bg-white/5",
      )}
    >
      <CheckBox checked={selected} />
      <PersonAvatar name={person.name} avatarUrl={person.avatarUrl} />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-foreground">{person.name}</p>
        <PersonIdentity email={person.email} />
      </div>
    </button>
  );
}

/** A workspace member already on the project — shown so nobody hunts for a name that is present. */
function AlreadyAddedRow({ person }: { person: ChannelPerson }) {
  return (
    <div className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2">
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border border-border bg-muted text-muted-foreground/70">
        <Check size={11} strokeWidth={3} />
      </span>
      <PersonAvatar name={person.name} avatarUrl={person.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-muted-foreground">{person.name}</p>
        <PersonIdentity email={person.email} />
      </div>
      <span className="shrink-0 text-xs text-muted-foreground/70">On the project</span>
    </div>
  );
}

export function AddPeopleList({
  available,
  existing,
  selectedIds,
  onToggle,
}: {
  available: ChannelPerson[];
  existing: ChannelPerson[];
  selectedIds: ReadonlySet<string>;
  onToggle: (userId: string) => void;
}) {
  return (
    <>
      {available.length > 0 && (
        <>
          <GroupLabel>In the workspace</GroupLabel>
          <div className="space-y-px">
            {available.map((person) => (
              <PickerRow
                key={person.id}
                person={person}
                selected={selectedIds.has(person.id)}
                onToggle={() => onToggle(person.id)}
              />
            ))}
          </div>
        </>
      )}

      {existing.length > 0 && (
        <>
          <GroupLabel>Already on the project</GroupLabel>
          <div className="space-y-px">
            {existing.map((person) => (
              <AlreadyAddedRow key={person.id} person={person} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
