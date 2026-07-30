import { AlertCircle } from "lucide-react";
import type { RepoApplicationConfig } from "@trace/gql";
import { Button } from "../../ui/button";
import {
  Dialog,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-black/60 backdrop-blur-[2px]"
        className="flex h-[660px] max-h-[calc(100dvh-3rem)] gap-0 overflow-hidden p-0 sm:max-w-[880px]"
      >
        <DialogHeader className="shrink-0 gap-0.5 border-b border-border px-6 py-4 pr-14 text-left">
          <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em]">
            Session automation
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-5">
            <span className="font-medium text-foreground">{repoName}</span> · how sessions on this
            repository install, run, and expose the codebase. Shared by every coding channel.
          </DialogDescription>
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

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-6 py-3.5">
          <button
            type="button"
            disabled={!draft.issues.length}
            onClick={() => {
              if (draft.issueSection) draft.setActiveSection(draft.issueSection);
            }}
            className="flex min-w-0 items-center gap-1.5 text-left text-xs text-amber-400 disabled:text-muted-foreground"
          >
            {draft.issues.length ? <AlertCircle size={13} className="shrink-0" /> : null}
            <span className="truncate">
              {draft.formError ??
                (draft.issues.length
                  ? `${draft.issues.length} issue${draft.issues.length === 1 ? "" : "s"} — ${draft.issues[0]}`
                  : draft.dirty
                    ? "Unsaved changes"
                    : "Configuration saved")}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!draft.dirty || saving || draft.issues.length > 0}
              onClick={() => void draft.save()}
            >
              {saving ? "Saving..." : "Save configuration"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
