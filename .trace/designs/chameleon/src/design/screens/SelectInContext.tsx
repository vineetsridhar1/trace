import { DesignScreen } from "../primitives/DesignScreen";
import { SpecCard, SpecHeader } from "../components/select/Spec";
import { LiveSelect } from "../components/select/LiveSelect";
import { SpecTrigger } from "../components/select/SelectMock";
import {
  CloudIcon,
  EyeIcon,
  MonitorIcon,
  ServerIcon,
  ShieldIcon,
  UserIcon,
} from "../components/select/icons";

const SRC = "src/design/screens/SelectInContext.tsx";

const machineOptions = [
  { value: "cloud", label: "Cloud sandbox", icon: <CloudIcon /> },
  { value: "odm", label: "ODM2H67-M", icon: <MonitorIcon /> },
  { value: "runner-2", label: "build-runner-02", icon: <ServerIcon /> },
  { value: "runner-3", label: "build-runner-03 — offline", icon: <ServerIcon />, disabled: true },
];

const regionOptions = [
  { value: "fra", label: "Frankfurt (eu-central-1)" },
  { value: "iad", label: "N. Virginia (us-east-1)" },
  { value: "sin", label: "Singapore (ap-southeast-1)" },
];

const roleOptions = [
  { value: "admin", label: "Admin", icon: <ShieldIcon /> },
  { value: "member", label: "Member", icon: <UserIcon /> },
  { value: "observer", label: "Observer", icon: <EyeIcon /> },
];

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "running", label: "Running" },
  { value: "stopped", label: "Stopped" },
  { value: "failed", label: "Failed" },
];

const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
];

const memberRows = [
  { name: "Dana Whitfield", email: "dana@northstar.dev", role: "Admin", joined: "Apr 16, 2026" },
  { name: "Priya Raman", email: "priya@northstar.dev", role: "Member", joined: "Apr 20, 2026" },
  { name: "Jonas Beck", email: "jonas@northstar.dev", role: "Member", joined: "May 02, 2026" },
  { name: "Ines Farkas", email: "ines@northstar.dev", role: "Observer", joined: "Jun 11, 2026" },
];

function FieldLabel({ children, htmlFor }: { children: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="text-[13px] font-medium text-design-foreground">
      {children}
    </label>
  );
}

export default function SelectInContext() {
  return (
    <DesignScreen data-trace-id="select-in-context" data-trace-source={SRC} className="p-10">
      <SpecHeader
        data-trace-id="in-context-header"
        data-trace-source={SRC}
        title="Select — one recipe in context"
        description="The three placements that drifted apart today — settings forms, table rows, and filter toolbars — using the single spec. Only width and the size prop change. The selects below are live: open them."
      />

      <div className="mt-8 grid grid-cols-12 gap-6">
        <SpecCard
          data-trace-id="context-settings"
          data-trace-source={SRC}
          className="col-span-5"
          title="Settings form — size default"
          caption="Fills the form column. Label above, helper text below, invalid pairs with a message."
        >
          <div className="space-y-5">
            <div className="space-y-2">
              <FieldLabel>Default machine</FieldLabel>
              <LiveSelect
                data-trace-id="context-machine-select"
                data-trace-source={SRC}
                label="Default machine"
                options={machineOptions}
                defaultValue="odm"
              />
              <p className="text-xs text-design-muted">New sessions start on this machine.</p>
            </div>
            <div className="space-y-2">
              <FieldLabel>Region</FieldLabel>
              <LiveSelect
                data-trace-id="context-region-select"
                data-trace-source={SRC}
                label="Region"
                options={regionOptions}
                placeholder="Select a region…"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-design-border pt-4">
              <button
                type="button"
                className="flex h-8 items-center rounded-[6px] border border-design-border bg-design-surface px-3 text-sm font-medium text-design-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex h-8 items-center rounded-[6px] bg-design-primary px-3 text-sm font-medium text-design-primary-foreground"
              >
                Save changes
              </button>
            </div>
          </div>
        </SpecCard>

        <div className="col-span-7 space-y-6">
          <SpecCard
            data-trace-id="context-toolbar"
            data-trace-source={SRC}
            title="Filter toolbar — size sm"
            caption="Fixed widths sized to the longest option. Filters commit on selection."
          >
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-[220px] items-center rounded-[6px] border border-design-border bg-design-surface px-2.5 text-sm text-design-muted">
                Search sessions…
              </div>
              <LiveSelect
                data-trace-id="context-status-select"
                data-trace-source={SRC}
                label="Status filter"
                size="sm"
                options={statusOptions}
                defaultValue="all"
                className="w-[140px]"
              />
              <LiveSelect
                data-trace-id="context-sort-select"
                data-trace-source={SRC}
                label="Sort order"
                size="sm"
                options={sortOptions}
                defaultValue="newest"
                className="w-[140px]"
              />
              <p className="ml-auto text-xs text-design-muted">128 sessions</p>
            </div>
          </SpecCard>

          <SpecCard
            data-trace-id="context-table"
            data-trace-source={SRC}
            title="Table rows — size sm"
            caption="Inline role select per row. Value text matches the item label; the first row is live."
          >
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-design-border text-left">
                  <th className="pb-2 pr-4 text-xs font-medium text-design-muted">Member</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-design-muted">Role</th>
                  <th className="pb-2 text-right text-xs font-medium text-design-muted">Joined</th>
                </tr>
              </thead>
              <tbody>
                {memberRows.map((row, index) => (
                  <tr key={row.email} className="border-b border-design-border last:border-b-0">
                    <td className="py-2.5 pr-4">
                      <p className="text-[13px] font-medium text-design-foreground">{row.name}</p>
                      <p className="text-xs text-design-muted">{row.email}</p>
                    </td>
                    <td className="py-2.5 pr-4">
                      {index === 0 ? (
                        <LiveSelect
                          data-trace-id="context-role-select"
                          data-trace-source={SRC}
                          label={`Role for ${row.name}`}
                          size="sm"
                          options={roleOptions}
                          defaultValue="admin"
                          className="w-[150px]"
                          menuClassName="w-[170px]"
                        />
                      ) : (
                        <SpecTrigger size="sm" value={row.role} className="w-[150px]" />
                      )}
                    </td>
                    <td className="py-2.5 text-right text-xs text-design-muted">{row.joined}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SpecCard>
        </div>
      </div>
    </DesignScreen>
  );
}
