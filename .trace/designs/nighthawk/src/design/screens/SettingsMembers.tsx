import { SettingsShell } from "../components/settings/SettingsShell";
import { Avatar, ControlButton, Panel, SelectMenu, StatusPill } from "../components/settings/bits";
import { Icon } from "../components/settings/icons";

const SOURCE = "src/design/screens/SettingsMembers.tsx";

const MEMBERS = [
  {
    name: "Vineet Sridhar",
    email: "vineet@nighthawk.dev",
    role: "Admin",
    joined: "Mar 12, 2026",
    you: true,
  },
  { name: "Maya Okafor", email: "maya@nighthawk.dev", role: "Admin", joined: "Mar 12, 2026" },
  { name: "Dan Petrov", email: "dan@nighthawk.dev", role: "Member", joined: "Apr 2, 2026" },
  { name: "Priya Raman", email: "priya@nighthawk.dev", role: "Member", joined: "Apr 29, 2026" },
  { name: "Sam Whitfield", email: "sam@nighthawk.dev", role: "Observer", joined: "May 15, 2026" },
];

const ROLE_OPTIONS = ["Admin", "Member", "Observer"];

export default function SettingsMembers() {
  return (
    <SettingsShell
      screen="members"
      active="members"
      title="Members"
      description="Manage who has access to Nighthawk Labs. Admins manage settings and members, Members run sessions, Observers are read-only."
      width="wide"
      action={
        <ControlButton traceId="members-invite-cta" variant="primary" icon="plus">
          Invite member
        </ControlButton>
      }
    >
      {/* Invite by email — replaces search-only adding that dead-ends on unregistered users */}
      <Panel traceId="members-invite-panel" className="mb-6 p-4">
        <div className="flex items-center gap-2">
          <Icon name="users" size={15} className="text-design-muted" />
          <p
            data-trace-id="members-invite-title"
            data-trace-source={SOURCE}
            className="text-[13px] font-medium text-design-foreground"
          >
            Invite by email
          </p>
        </div>
        <div className="mt-3 flex items-end gap-2">
          <label className="min-w-0 flex-1" data-trace-id="members-invite-field" data-trace-source={SOURCE}>
            <input
              type="email"
              aria-label="Email address"
              placeholder="colleague@company.com — they get a link even if they haven't signed up yet"
              className="h-9 w-full rounded-design-control border border-design-border bg-design-background px-3 text-[13px] text-design-foreground outline-none transition-colors placeholder:text-design-muted focus:border-design-primary"
            />
          </label>
          <SelectMenu
            traceId="members-invite-role"
            label="Role"
            options={ROLE_OPTIONS}
            initial="Member"
            className="w-36"
          />
          <ControlButton traceId="members-invite-send" variant="primary">
            Send invite
          </ControlButton>
        </div>
      </Panel>

      {/* Member table */}
      <Panel traceId="members-table" className="overflow-hidden">
        <div
          data-trace-id="members-table-head"
          data-trace-source={SOURCE}
          className="grid grid-cols-[minmax(0,1fr)_150px_120px_40px] items-center gap-4 border-b border-design-border bg-design-background/40 px-4 py-2.5"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-design-secondary">
            User
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-design-secondary">
            Role
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-design-secondary">
            Joined
          </span>
          <span />
        </div>
        {MEMBERS.map((member, index) => (
          <div
            key={member.email}
            data-trace-id={`members-row-${index}`}
            data-trace-source={SOURCE}
            className="grid grid-cols-[minmax(0,1fr)_150px_120px_40px] items-center gap-4 border-b border-design-border px-4 py-3 transition-colors last:border-b-0 hover:bg-design-background/40"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={member.name} traceId={`members-avatar-${index}`} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-design-foreground">
                  {member.name}
                  {member.you ? <span className="ml-1.5 text-xs font-normal text-design-muted">(you)</span> : null}
                </p>
                <p className="truncate text-xs text-design-muted">{member.email}</p>
              </div>
            </div>
            {member.you ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-design-muted">
                <Icon name="shield" size={13} />
                {member.role}
              </span>
            ) : (
              <SelectMenu
                traceId={`members-role-${index}`}
                label=""
                options={ROLE_OPTIONS}
                initial={member.role}
                className="-mt-3"
              />
            )}
            <span className="text-[13px] text-design-muted">{member.joined}</span>
            <div className="flex justify-end">
              {!member.you ? (
                <ControlButton
                  traceId={`members-remove-${index}`}
                  variant="ghost"
                  size="icon"
                  icon="trash"
                  aria-label={`Remove ${member.name}`}
                  className="hover:text-design-danger"
                />
              ) : null}
            </div>
          </div>
        ))}
      </Panel>

      {/* Pending invites */}
      <div className="mt-6" data-trace-id="members-pending" data-trace-source={SOURCE}>
        <p
          data-trace-id="members-pending-title"
          data-trace-source={SOURCE}
          className="mb-2 text-[13px] font-medium text-design-foreground"
        >
          Pending invites
        </p>
        <Panel traceId="members-pending-panel" className="overflow-hidden">
          <div
            data-trace-id="members-pending-row"
            data-trace-source={SOURCE}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-design-border text-design-muted">
                <Icon name="clock" size={14} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-design-foreground">
                  jordan@nighthawk.dev
                </p>
                <p className="text-xs text-design-muted">Invited Jul 28, 2026 · Member</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill tone="warning" label="Pending" traceId="members-pending-pill" />
              <ControlButton traceId="members-pending-resend" size="sm">
                Resend
              </ControlButton>
              <ControlButton traceId="members-pending-revoke" size="sm" variant="ghost" className="hover:text-design-danger">
                Revoke
              </ControlButton>
            </div>
          </div>
        </Panel>
      </div>
    </SettingsShell>
  );
}
