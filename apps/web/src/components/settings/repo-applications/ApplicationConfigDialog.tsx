import { AlertCircle, X } from "lucide-react";
import type { RepoApplicationConfig } from "@trace/gql";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { SessionAutomationApplications } from "./SessionAutomationApplications";
import { SessionAutomationRail } from "./SessionAutomationRail";
import { SessionAutomationRunScripts } from "./SessionAutomationRunScripts";
import { SessionAutomationSetupScripts } from "./SessionAutomationSetupScripts";
import { useSessionAutomationDraft } from "./useSessionAutomationDraft";
import { useUIStore } from "../../../stores/ui";

export function ApplicationConfigDialog({
  open,
  repoName,
  config,
  secretNames,
  saving,
  error,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  repoName: string;
  config: RepoApplicationConfig | undefined;
  secretNames: string[];
  saving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (config: RepoApplicationConfig) => Promise<void>;
}) {
  const draft = useSessionAutomationDraft({
    open,
    config,
    error,
    secretNames,
    onOpenChange,
    onSave,
  });
  const setSettingsInitialTab = useUIStore((state) => state.setSettingsInitialTab);
  const manageSecrets = () => {
    onOpenChange(false);
    setSettingsInitialTab("org-secrets");
  };
  const issueSectionLabel =
    draft.issueSection === "setup"
      ? "Setup scripts"
      : draft.issueSection === "run"
        ? "Run scripts"
        : "Applications";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/60 backdrop-blur-[2px]"
        className="flex h-[660px] max-h-[calc(100dvh-3rem)] flex-col gap-0 overflow-hidden rounded-xl border border-border bg-card p-0 text-foreground shadow-[0_24px_80px_rgba(0,0,0,0.45)] ring-0 [--background:#0a0a0c] [--border:#27272d] [--card-foreground:#fafafa] [--card:#161619] [--destructive:#ef4444] [--foreground:#fafafa] [--input:#27272d] [--muted-foreground:#9d9da8] [--muted:#27272d] [--popover-foreground:#fafafa] [--popover:#161619] [--primary-foreground:#0a0a0c] [--primary:#fafafa] [--ring:#fafafa] sm:max-w-[880px]"
      >
        <DialogHeader className="shrink-0 flex-row items-start justify-between gap-4 border-b border-border px-6 py-4 text-left">
          <div className="min-w-0">
            <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em]">
              Session automation
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-[13px] leading-5">
              <span className="font-medium text-foreground">{repoName}</span> · how sessions on this
              repository install, run, and expose the codebase. Shared by every coding channel.
            </DialogDescription>
          </div>
          <DialogClose
            aria-label="Close Session automation"
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            <X size={15} />
          </DialogClose>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <SessionAutomationRail
            active={draft.activeSection}
            config={draft.draft}
            issueSections={draft.issueSections}
            onChange={draft.setActiveSection}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            {draft.activeSection === "setup" ? (
              <SessionAutomationSetupScripts
                scripts={draft.draft.setupScripts}
                secretNames={secretNames}
                onAdd={draft.addSetupScript}
                onRemove={draft.removeSetupScript}
                onUpdate={draft.updateSetupScript}
                onAddEnv={draft.addEnv}
                onRemoveEnv={draft.removeEnvEntry}
                onUpdateEnv={draft.updateEnvEntry}
                onManageSecrets={manageSecrets}
              />
            ) : draft.activeSection === "run" ? (
              <SessionAutomationRunScripts
                scripts={draft.draft.runScripts}
                onAdd={draft.addRunScript}
                onRemove={draft.removeRunScript}
                onUpdate={draft.updateRunScript}
              />
            ) : (
              <SessionAutomationApplications
                applications={draft.draft.applications}
                expandedProcessId={draft.expandedProcessId}
                secretNames={secretNames}
                onAddApplication={draft.addApplication}
                onAddEnv={draft.addEnv}
                onAddPort={draft.addPort}
                onAddProcess={draft.addProcess}
                onRemoveApplication={draft.removeApplication}
                onRemoveEnv={draft.removeEnvEntry}
                onRemovePort={draft.removePort}
                onRemoveProcess={draft.removeProcess}
                onSetExpanded={draft.setExpandedProcessId}
                onUpdateApplication={draft.updateApplication}
                onUpdateEnv={draft.updateEnvEntry}
                onUpdatePort={draft.updatePort}
                onUpdateProcess={draft.updateProcess}
                onManageSecrets={manageSecrets}
              />
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-3.5">
          <button
            type="button"
            disabled={!draft.issues.length}
            onClick={() => {
              if (draft.issueSection) draft.setActiveSection(draft.issueSection);
            }}
            className="flex min-w-0 items-center gap-1.5 rounded-lg text-left text-xs text-amber-400 transition-colors hover:text-foreground disabled:text-transparent"
          >
            {draft.issues.length ? <AlertCircle size={13} className="shrink-0" /> : null}
            <span className="truncate">
              {draft.formError ??
                (draft.issues.length
                  ? `${draft.issues.length} issue${draft.issues.length === 1 ? "" : "s"} in ${issueSectionLabel} — ${draft.issues[0]}`
                  : "")}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-9 px-3.5 text-[13px] text-muted-foreground"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!draft.dirty || saving || draft.issues.length > 0}
              onClick={() => void draft.save()}
              className="h-9 px-3.5 text-[13px]"
            >
              {saving ? "Saving..." : "Save configuration"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
