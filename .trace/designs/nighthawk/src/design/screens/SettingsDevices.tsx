import { useState } from "react";
import { cn } from "../lib/cn";
import { SettingsShell } from "../components/settings/SettingsShell";
import { Avatar, ControlButton, Panel, StatusPill } from "../components/settings/bits";
import { Icon } from "../components/settings/icons";

const SOURCE = "src/design/screens/SettingsDevices.tsx";

const DURATIONS = ["1 hour", "3 hours", "1 day"];

const GRANTS = [
  {
    name: "Dan Petrov",
    email: "dan@nighthawk.dev",
    scope: "Workspace: trace",
    capabilities: ["Sessions"],
    expires: "Today, 8:00 PM",
  },
  {
    name: "Priya Raman",
    email: "priya@nighthawk.dev",
    scope: "All sessions",
    capabilities: ["Sessions", "Terminal"],
    expires: "Jul 31, 9:00 AM",
  },
];

export default function SettingsDevices() {
  const [terminalGranted, setTerminalGranted] = useState(true);
  const [duration, setDuration] = useState("3 hours");

  return (
    <SettingsShell
      screen="devices"
      active="devices"
      title="Devices & access"
      description="Your connected devices, mobile pairing, and who may run sessions on your local bridges."
      width="wide"
    >
      {/* This device + mobile pairing */}
      <div className="mb-8 grid grid-cols-[3fr_2fr] gap-4">
        <Panel traceId="devices-current" className="p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-design-control border border-design-border bg-design-background text-design-muted">
              <Icon name="laptop" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-semibold text-design-foreground">
                  Vineet's MacBook Pro
                </p>
                <StatusPill tone="success" label="Connected" traceId="devices-current-pill" />
              </div>
              <p className="mt-0.5 text-xs text-design-muted">This device · bridge running in the desktop app</p>
              <p className="mt-2 font-design-mono text-[11px] text-design-muted">
                instance bridge_8f2ac91d · connected since 9:02 AM
              </p>
            </div>
            <ControlButton traceId="devices-current-rename" size="sm" icon="pencil">
              Rename
            </ControlButton>
          </div>
          <div
            data-trace-id="devices-current-note"
            data-trace-source={SOURCE}
            className="mt-4 flex items-start gap-2 rounded-design-control bg-design-background/50 px-3 py-2.5"
          >
            <Icon name="info" size={13} className="mt-0.5 shrink-0 text-design-secondary" />
            <p className="text-xs leading-4 text-design-muted">
              Sessions on this bridge run against your local checkouts. Other members need your
              approval below before they can use it.
            </p>
          </div>
        </Panel>

        <Panel traceId="devices-pairing" className="p-4">
          <div className="flex items-start gap-4">
            {/* CSS-drawn QR placeholder */}
            <div
              data-trace-id="devices-pairing-qr"
              data-trace-source={SOURCE}
              aria-label="Mobile pairing QR code"
              className="grid h-24 w-24 shrink-0 grid-cols-6 gap-0.5 rounded-design-control border border-design-border bg-design-background p-2"
            >
              {[
                1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0,
                1, 0, 1, 1, 0, 1, 0, 1,
              ].map((cell, index) => (
                <span
                  key={index}
                  className={cn("rounded-[1px]", cell ? "bg-design-foreground" : "bg-transparent")}
                />
              ))}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-design-foreground">Pair the mobile app</p>
              <p className="mt-1 text-xs leading-5 text-design-muted">
                Scan with the Trace mobile app to follow sessions from your phone.
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-design-muted">
                <Icon name="clock" size={12} />
                Code expires in 4:32
              </p>
              <ControlButton traceId="devices-pairing-new" size="sm" className="mt-2.5" icon="refresh">
                New code
              </ControlButton>
            </div>
          </div>
        </Panel>
      </div>

      {/* Pending access request — flattened approval with visible duration */}
      <section data-trace-id="devices-requests" data-trace-source={SOURCE} className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-design-foreground">
          Access requests <span className="ml-1 font-normal text-design-muted">1 pending</span>
        </h2>
        <Panel traceId="devices-request-card" className="border-design-warning/40 p-4">
          <div className="flex items-start gap-3">
            <Avatar name="Maya Okafor" traceId="devices-request-avatar" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-design-foreground">
                <span className="font-semibold">Maya Okafor</span> requests access to{" "}
                <span className="font-semibold">Vineet's MacBook Pro</span>
              </p>
              <p className="mt-0.5 text-xs text-design-muted">
                All sessions · requested today at 2:12 PM · asked for Sessions + Terminal
              </p>

              <div className="mt-4 grid grid-cols-2 gap-6">
                {/* Capabilities */}
                <div data-trace-id="devices-request-capabilities" data-trace-source={SOURCE}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-design-secondary">
                    Grant capabilities
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between rounded-design-control border border-design-border bg-design-background px-3 py-2">
                      <span className="flex items-center gap-2 text-[13px] text-design-foreground">
                        <Icon name="zap" size={13} className="text-design-muted" />
                        Sessions
                      </span>
                      <span className="text-[11px] text-design-muted">Always included</span>
                    </div>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={terminalGranted}
                      data-trace-id="devices-request-terminal"
                      data-trace-source={SOURCE}
                      onClick={() => setTerminalGranted((v) => !v)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-design-control border px-3 py-2 text-left transition-colors duration-design ease-design",
                        terminalGranted
                          ? "border-design-primary bg-design-background"
                          : "border-design-border bg-design-background/50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex items-center gap-2 text-[13px]",
                          terminalGranted ? "text-design-foreground" : "text-design-muted",
                        )}
                      >
                        <Icon name="terminal" size={13} />
                        Terminal
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-design-muted">
                        {terminalGranted ? (
                          <>
                            <Icon name="check" size={12} className="text-design-success" />
                            Will grant shell access
                          </>
                        ) : (
                          "Removed from approval"
                        )}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Duration segmented control — no longer hidden in a dropdown */}
                <div data-trace-id="devices-request-duration" data-trace-source={SOURCE}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-design-secondary">
                    Access expires after
                  </p>
                  <div
                    role="radiogroup"
                    aria-label="Access duration"
                    className="grid grid-cols-3 gap-1 rounded-design-control border border-design-border bg-design-background p-1"
                  >
                    {DURATIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={duration === option}
                        onClick={() => setDuration(option)}
                        className={cn(
                          "h-8 rounded-md text-[13px] transition-colors duration-design ease-design",
                          duration === option
                            ? "bg-design-surface font-medium text-design-foreground shadow-design-surface"
                            : "text-design-muted hover:text-design-foreground",
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] leading-4 text-design-muted">
                    Access ends automatically — you can revoke it earlier at any time.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <ControlButton traceId="devices-request-approve" variant="primary" icon="check">
                  Approve — {terminalGranted ? "Sessions + Terminal" : "Sessions"} for {duration}
                </ControlButton>
                <ControlButton traceId="devices-request-deny">Deny</ControlButton>
              </div>
            </div>
          </div>
        </Panel>
      </section>

      {/* Active grants */}
      <section data-trace-id="devices-grants" data-trace-source={SOURCE}>
        <h2 className="mb-3 text-sm font-semibold text-design-foreground">Active grants</h2>
        <Panel traceId="devices-grants-table" className="overflow-hidden">
          <div
            data-trace-id="devices-grants-head"
            data-trace-source={SOURCE}
            className="grid grid-cols-[minmax(0,1fr)_120px_150px_120px_215px] items-center gap-4 border-b border-design-border bg-design-background/40 px-4 py-2.5"
          >
            {["Member", "Scope", "Capabilities", "Expires", ""].map((label, index) => (
              <span
                key={index}
                className="text-[11px] font-semibold uppercase tracking-[0.08em] text-design-secondary"
              >
                {label}
              </span>
            ))}
          </div>
          {GRANTS.map((grant, index) => (
            <div
              key={grant.email}
              data-trace-id={`devices-grant-${index}`}
              data-trace-source={SOURCE}
              className="grid grid-cols-[minmax(0,1fr)_120px_150px_120px_215px] items-center gap-4 border-b border-design-border px-4 py-3 last:border-b-0 hover:bg-design-background/40"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={grant.name} traceId={`devices-grant-avatar-${index}`} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-design-foreground">{grant.name}</p>
                  <p className="truncate text-xs text-design-muted">{grant.email}</p>
                </div>
              </div>
              <span className="truncate text-[13px] text-design-muted">{grant.scope}</span>
              <div className="flex flex-wrap gap-1">
                {grant.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="inline-flex items-center gap-1 rounded-full border border-design-border bg-design-background px-2 py-0.5 text-[11px] text-design-foreground"
                  >
                    <Icon name={cap === "Terminal" ? "terminal" : "zap"} size={10} />
                    {cap}
                  </span>
                ))}
              </div>
              <span className="flex items-center gap-1.5 text-[13px] text-design-muted">
                <Icon name="clock" size={12} className="shrink-0" />
                {grant.expires}
              </span>
              <div className="flex justify-end gap-2">
                <ControlButton traceId={`devices-grant-terminal-${index}`} size="sm">
                  {grant.capabilities.includes("Terminal") ? "Disable terminal" : "Enable terminal"}
                </ControlButton>
                <ControlButton
                  traceId={`devices-grant-revoke-${index}`}
                  variant="danger"
                  size="sm"
                >
                  Revoke
                </ControlButton>
              </div>
            </div>
          ))}
        </Panel>
      </section>
    </SettingsShell>
  );
}
