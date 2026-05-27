import { useState } from "react";
import { useAuthStore } from "@trace/client-core";
import { gql } from "@urql/core";
import { client } from "../../lib/urql";
import type { DetectedRepo, ProjectParentSelection, RepoDialogMode } from "./repo-dialog-types";

const CREATE_REPO_MUTATION = gql`
  mutation CreateRepo($input: CreateRepoInput!) {
    createRepo(input: $input) {
      id
    }
  }
`;

export const isElectron =
  typeof window !== "undefined" && typeof window.trace?.pickFolder === "function";
export const canCreateLocalProject =
  typeof window !== "undefined" &&
  typeof window.trace?.pickProjectParentFolder === "function" &&
  typeof window.trace?.createLocalProject === "function";

interface Options {
  controlledOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated?: () => void;
}

export function useCreateRepoDialog({ controlledOpen, onOpenChange, onCreated }: Options) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [mode, setMode] = useState<RepoDialogMode>("link");
  const [detected, setDetected] = useState<DetectedRepo | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [parentSelection, setParentSelection] = useState<ProjectParentSelection | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualRemoteUrl, setManualRemoteUrl] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const open = controlledOpen ?? uncontrolledOpen;

  async function handlePickFolder() {
    setError(null);
    setDetected(null);
    setDefaultBranch("");

    const folderPath = await window.trace!.pickFolder();
    if (!folderPath) return;
    setSelectedPath(folderPath);

    const result = await window.trace!.getGitInfo(folderPath);
    if ("error" in result) {
      setError(result.error);
      return;
    }

    setDetected({
      name: result.name,
      remoteUrl: result.remoteUrl,
      defaultBranch: result.defaultBranch,
    });
    setDefaultBranch(result.defaultBranch);
  }

  async function handlePickParentFolder() {
    if (!window.trace?.pickProjectParentFolder) return;
    setError(null);

    const selection = await window.trace.pickProjectParentFolder();
    if (!selection) return;
    setParentSelection(selection);
  }

  async function createRepoRecord(repo: DetectedRepo): Promise<string> {
    if (!activeOrgId) throw new Error("No active organization selected.");

    const result = await client
      .mutation(CREATE_REPO_MUTATION, {
        input: {
          organizationId: activeOrgId,
          name: repo.name,
          remoteUrl: repo.remoteUrl,
          defaultBranch: repo.defaultBranch,
        },
      })
      .toPromise();

    if (result.error) throw new Error(result.error.message);

    const repoId = result.data?.createRepo?.id;
    if (!repoId) throw new Error("Repository was not created.");
    return repoId;
  }

  async function createRepo(repo: DetectedRepo, localPath?: string) {
    const repoId = await createRepoRecord(repo);
    if (localPath && window.trace?.saveRepoPath) {
      await window.trace.saveRepoPath(repoId, localPath);
    }
  }

  async function handleLink() {
    const branch = defaultBranch.trim();
    const repo =
      detected ??
      (manualName.trim()
        ? {
            name: manualName.trim(),
            remoteUrl: manualRemoteUrl.trim() || null,
            defaultBranch: branch,
          }
        : null);
    if (!repo || !branch) return;

    setCreating(true);
    setError(null);
    try {
      await createRepo({ ...repo, defaultBranch: branch }, selectedPath ?? undefined);
      resetAndClose();
      onCreated?.();
    } catch (saveErr) {
      setError(saveErr instanceof Error ? saveErr.message : "Failed to link repository");
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateProject() {
    if (!projectName.trim() || !parentSelection || !window.trace?.createLocalProject) return;

    setCreating(true);
    setError(null);
    try {
      const result = await window.trace.createLocalProject({
        name: projectName.trim(),
        parentToken: parentSelection.token,
      });
      if ("error" in result) {
        setError(
          `${result.error} If the folder was created, use Existing to link it after resolving the error.`,
        );
        return;
      }

      await createRepo(
        {
          name: result.name,
          remoteUrl: result.remoteUrl,
          defaultBranch: result.defaultBranch,
        },
        result.path,
      );
      resetAndClose();
      onCreated?.();
    } catch (createErr) {
      const message = createErr instanceof Error ? createErr.message : "Failed to create project";
      setError(
        `${message} If the folder was created, use Existing to link it after resolving the error.`,
      );
    } finally {
      setCreating(false);
    }
  }

  function resetAndClose() {
    setMode("link");
    setDetected(null);
    setSelectedPath(null);
    setError(null);
    setProjectName("");
    setParentSelection(null);
    setManualName("");
    setManualRemoteUrl("");
    setDefaultBranch("");
    setUncontrolledOpen(false);
    onOpenChange?.(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetAndClose();
    else {
      setUncontrolledOpen(true);
      onOpenChange?.(true);
    }
  }

  return {
    open,
    mode,
    detected,
    error,
    creating,
    projectName,
    parentSelection,
    manualName,
    manualRemoteUrl,
    defaultBranch,
    canLink: (!!detected || !!manualName.trim()) && !!defaultBranch.trim(),
    canCreate: canCreateLocalProject && !!parentSelection && !!projectName.trim(),
    setMode,
    setProjectName,
    setManualName,
    setManualRemoteUrl,
    setDefaultBranch,
    handleOpenChange,
    handlePickFolder,
    handlePickParentFolder,
    handleLink,
    handleCreateProject,
  };
}
