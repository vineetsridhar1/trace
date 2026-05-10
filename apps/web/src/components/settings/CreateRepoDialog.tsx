import { Plus } from "lucide-react";
import { useIsMobile } from "../../hooks/use-mobile";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogTrigger as DialogTrigger,
  ResponsiveDialogDescription as DialogDescription,
} from "../ui/responsive-dialog";
import { Button } from "../ui/button";
import { ExistingRepoForm } from "./ExistingRepoForm";
import { ManualRepoForm } from "./ManualRepoForm";
import { NewLocalProjectForm } from "./NewLocalProjectForm";
import { RepoDialogModeSwitch } from "./RepoDialogModeSwitch";
import {
  canCreateLocalProject,
  isElectron,
  useCreateRepoDialog,
} from "./useCreateRepoDialog";

interface CreateRepoDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  onCreated?: () => void;
}

export function CreateRepoDialog({
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  onCreated,
}: CreateRepoDialogProps) {
  const isMobile = useIsMobile();
  const state = useCreateRepoDialog({ controlledOpen, onOpenChange, onCreated });

  return (
    <Dialog open={state.open} onOpenChange={state.handleOpenChange}>
      {!hideTrigger && (
        <DialogTrigger className="inline-flex">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Plus size={14} />
            Link Repository
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link Repository</DialogTitle>
          <DialogDescription>
            {isElectron
              ? "Select an existing git repository or create a new local project."
              : "Enter repository details to link it to your organization."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {isElectron ? (
            <>
              {canCreateLocalProject && (
                <RepoDialogModeSwitch mode={state.mode} onModeChange={state.setMode} />
              )}

              {state.mode === "link" ? (
                <ExistingRepoForm
                  detected={state.detected}
                  onPickFolder={state.handlePickFolder}
                />
              ) : (
                <NewLocalProjectForm
                  projectName={state.projectName}
                  parentSelection={state.parentSelection}
                  autoFocus={!isMobile}
                  onProjectNameChange={state.setProjectName}
                  onPickParentFolder={state.handlePickParentFolder}
                />
              )}
            </>
          ) : (
            <ManualRepoForm
              name={state.manualName}
              remoteUrl={state.manualRemoteUrl}
              autoFocus={!isMobile}
              onNameChange={state.setManualName}
              onRemoteUrlChange={state.setManualRemoteUrl}
            />
          )}

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        </div>

        <DialogFooter>
          <Button
            onClick={state.mode === "create" ? state.handleCreateProject : state.handleLink}
            disabled={
              (state.mode === "create" ? !state.canCreate : !state.canLink) || state.creating
            }
          >
            {state.creating
              ? state.mode === "create"
                ? "Creating..."
                : "Linking..."
              : state.mode === "create"
                ? "Create Project"
                : "Link Repository"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
