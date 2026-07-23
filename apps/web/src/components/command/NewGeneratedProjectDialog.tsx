import { useCallback, useEffect, useState } from "react";
import { AppWindow, NotebookText, Palette, Sparkles } from "lucide-react";
import { gql } from "@urql/core";
import type { AgentEnvironment, Repo } from "@trace/gql";
import { useAuthStore, useEntityStore } from "@trace/client-core";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import {
  createAnimationSession,
  createAppSession,
  createDesignSession,
  createPdfSession,
} from "../../lib/create-quick-session";
import { client } from "../../lib/urql";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { navigateToSessionGroup } from "../../stores/ui";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "../ui/responsive-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

type GeneratedProjectKind = "app" | "design" | "pdf" | "animation";
const DESIGN_SYSTEMS_QUERY = gql`
  query DesignCreationOptions($organizationId: ID!) {
    repos(organizationId: $organizationId) {
      id
      name
      remoteUrl
      provider
    }
    agentEnvironments(orgId: $organizationId) {
      id
      name
      adapterType
      enabled
      isDefault
    }
  }
`;
const CREATE_SYSTEM = gql`
  mutation CreateDesignSystem($input: CreateDesignSystemInput!) {
    createDesignSystem(input: $input) {
      id
      authoringSessionGroupId
    }
  }
`;
const OPTIONS: Array<{
  kind: GeneratedProjectKind;
  title: string;
  description: string;
  Icon: typeof AppWindow;
}> = [
  {
    kind: "app",
    title: "App",
    description: "Build a full-stack product with a live preview.",
    Icon: AppWindow,
  },
  {
    kind: "design",
    title: "Design",
    description: "Explore product screens, flows, and visual directions.",
    Icon: Palette,
  },
  {
    kind: "pdf",
    title: "Document",
    description: "Create a print-ready PDF, report, flyer, or proposal.",
    Icon: NotebookText,
  },
  {
    kind: "animation",
    title: "Animation",
    description: "Build an interactive motion piece you can copy into your own app.",
    Icon: Sparkles,
  },
];

function repoLabel(repo: Repo): string {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(repo.name) || !repo.remoteUrl) return repo.name;
  return (
    repo.remoteUrl
      .replace(/\.git$/, "")
      .split("/")
      .pop() ?? repo.name
  );
}

export function NewGeneratedProjectDialog() {
  const kind = useCommandPaletteStore((state) => state.newGeneratedProjectKind);
  const close = useCommandPaletteStore((state) => state.closeGeneratedProjectDialog);
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const sessionGroups = useEntityStore((state) => state.sessionGroups);
  const sessions = useEntityStore((state) => state.sessions);
  const repos = useEntityStore(
    useShallow((state) => Object.values(state.repos).filter((repo) => repo.provider !== "managed")),
  );
  const environments = useEntityStore(
    useShallow((state) =>
      Object.values(state.agentEnvironments).filter(
        (environment) => environment.enabled && environment.adapterType === "provisioned",
      ),
    ),
  );
  const [environmentId, setEnvironmentId] = useState("");
  const [name, setName] = useState("");
  const [repoId, setRepoId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingAuthoringGroupId, setPendingAuthoringGroupId] = useState<string | null>(null);
  const selectedRepo = repos.find((repo) => repo.id === repoId);

  const createImmediate = useCallback(
    (nextKind: "app" | "design" | "pdf" | "animation") => {
      close();
      void (nextKind === "app"
        ? createAppSession()
        : nextKind === "design"
          ? createDesignSession()
          : nextKind === "pdf"
            ? createPdfSession()
            : createAnimationSession());
    },
    [close],
  );

  useEffect(() => {
    if (kind === "app" || kind === "design" || kind === "pdf" || kind === "animation")
      createImmediate(kind);
  }, [createImmediate, kind]);

  useEffect(() => {
    if (!activeOrgId || kind !== "design-system") return;
    let active = true;
    void client
      .query(
        DESIGN_SYSTEMS_QUERY,
        { organizationId: activeOrgId },
        { requestPolicy: "network-only" },
      )
      .toPromise()
      .then((result) => {
        if (!active || result.error) return;
        const nextRepos = (result.data?.repos ?? []).filter(
          (repo: Repo) => repo.provider !== "managed",
        ) as Repo[];
        const nextEnvironments = (result.data?.agentEnvironments ?? []).filter(
          (environment: AgentEnvironment) =>
            environment.enabled && environment.adapterType === "provisioned",
        ) as AgentEnvironment[];
        upsertMany("repos", nextRepos);
        upsertMany("agentEnvironments", nextEnvironments);
        if (!repoId && nextRepos[0]) setRepoId(nextRepos[0].id);
        if (!environmentId)
          setEnvironmentId(
            nextEnvironments.find((environment) => environment.isDefault)?.id ??
              nextEnvironments[0]?.id ??
              "",
          );
      });
    return () => {
      active = false;
    };
  }, [activeOrgId, environmentId, kind, repoId, upsertMany]);

  useEffect(() => {
    if (!pendingAuthoringGroupId) return;
    const group = sessionGroups[pendingAuthoringGroupId];
    if (!group) return;
    const session = Object.values(sessions).find(
      (candidate) => candidate.sessionGroupId === pendingAuthoringGroupId,
    );
    close();
    setPendingAuthoringGroupId(null);
    navigateToSessionGroup(null, pendingAuthoringGroupId, session?.id ?? null);
  }, [close, pendingAuthoringGroupId, sessionGroups, sessions]);

  const choose = (nextKind: GeneratedProjectKind) => createImmediate(nextKind);
  const submitSystem = async () => {
    if (!name.trim() || !repoId) return;
    setSubmitting(true);
    try {
      const result = await client
        .mutation(CREATE_SYSTEM, {
          input: {
            name: name.trim(),
            repoId,
            environmentId: environmentId || undefined,
          },
        })
        .toPromise();
      if (result.error) {
        toast.error("Could not create design system", { description: result.error.message });
        return;
      }
      const groupId = result.data?.createDesignSystem?.authoringSessionGroupId;
      if (groupId) setPendingAuthoringGroupId(groupId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ResponsiveDialog open={kind === "choose"} onOpenChange={(open) => !open && close()}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Create New</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="flex flex-col gap-2 py-4">
            {OPTIONS.map(({ kind: optionKind, title, description, Icon }) => (
              <button
                key={optionKind}
                type="button"
                onClick={() => choose(optionKind)}
                className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon size={20} className="text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </button>
            ))}
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
      <ResponsiveDialog open={kind === "design-system"} onOpenChange={(open) => !open && close()}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Create Design System</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-3 py-4">
            <label className="grid gap-1 text-sm">
              Name
              <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            </label>
            <label className="grid gap-1 text-sm">
              Source repository
              <Select
                value={repoId}
                onValueChange={(value) => {
                  setRepoId(value ?? "");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {selectedRepo ? repoLabel(selectedRepo) : "Select a repository"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {repos.map((repo) => (
                    <SelectItem key={repo.id} value={repo.id}>
                      {repoLabel(repo)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {environments.length > 1 ? (
              <label className="grid gap-1 text-sm">
                Authoring environment
                <Select
                  value={environmentId}
                  onValueChange={(value) => setEnvironmentId(value ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a cloud environment" />
                  </SelectTrigger>
                  <SelectContent>
                    {environments.map((environment) => (
                      <SelectItem key={environment.id} value={environment.id}>
                        {environment.name}
                        {environment.isDefault ? " · Default" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : environments.length === 0 ? (
              <p className="text-xs text-destructive">
                Configure an enabled cloud authoring environment first.
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button
                disabled={submitting || !name.trim() || !repoId || !environmentId}
                onClick={() => void submitSystem()}
              >
                {submitting ? "Creating…" : "Create Workbench"}
              </Button>
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
