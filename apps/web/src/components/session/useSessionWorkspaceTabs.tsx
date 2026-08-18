import { useMemo } from "react";
import {
  Activity,
  Bot,
  FileCode,
  Files,
  GitCompareArrows,
  Globe,
  TerminalSquare,
} from "lucide-react";
import type { SpatialWorkspaceTab } from "./SpatialWorkspace";
import type { WorkspaceSurface } from "./SidebarPanel";
import type { DraftWorkspaceTab } from "./useWorkspaceTabRequests";

/**
 * Canvas workspaces (app, design, design system, pdf, animation) render their
 * preview through a permanent tab owned by the session group. It has its own
 * namespace because it is not one of the on-demand workspace surfaces.
 */
export const CANVAS_TAB_ID = "canvas:preview";

interface SessionWorkspaceTabsOptions {
  sessions: Array<{ id: string; name: string; agentStatus?: string | null }>;
  artifactIds: string[];
  terminals: Array<{ id: string; customName?: string | null; status: string }>;
  files: Array<{ filePath: string; fileName: string; isDiff?: boolean }>;
  drafts: DraftWorkspaceTab[];
  browserTitles: Record<string, string>;
  trafficEndpointId: string | null;
  canvas: boolean;
}

export function useSessionWorkspaceTabs({
  sessions,
  artifactIds,
  terminals,
  files,
  drafts,
  browserTitles,
  trafficEndpointId,
  canvas,
}: SessionWorkspaceTabsOptions) {
  return useMemo<SpatialWorkspaceTab[]>(() => {
    const tabs: SpatialWorkspaceTab[] = canvas
      ? [{ id: CANVAS_TAB_ID, label: "Preview", icon: <Globe size={12} />, closable: false }]
      : [];

    tabs.push(
      ...sessions.map((session) => ({
        id: `session:${session.id}`,
        label: session.name,
        icon: <Bot size={12} />,
        status: session.agentStatus === "active" ? ("live" as const) : undefined,
      })),
    );

    tabs.push(
      ...artifactIds.map((artifactId) => ({
        id: `artifact:${artifactId}`,
        label: "Artifact",
        icon: <FileCode size={12} />,
      })),
      ...terminals.map((terminal, index) => ({
        id: `terminal:${terminal.id}`,
        label: terminal.customName || `Terminal ${index + 1}`,
        icon: <TerminalSquare size={12} />,
        status: terminal.status === "active" ? ("live" as const) : undefined,
      })),
      ...files.map((file) => ({
        id: `file:${file.filePath}`,
        label: file.fileName,
        icon: file.isDiff ? <GitCompareArrows size={12} /> : <FileCode size={12} />,
        status: file.isDiff ? ("changed" as const) : undefined,
      })),
      ...drafts.map((draft) => ({
        id: draft.id,
        label: workspaceSurfaceLabel(draft.surface, browserTitles[draft.id]),
        icon: workspaceSurfaceIcon(draft.surface),
        minContentWidth: draft.surface === "browser" ? 0 : undefined,
      })),
    );

    if (trafficEndpointId) {
      tabs.push({ id: "traffic", label: "Traffic", icon: <Activity size={12} /> });
    }
    return tabs;
  }, [artifactIds, browserTitles, canvas, drafts, files, sessions, terminals, trafficEndpointId]);
}

function workspaceSurfaceLabel(surface: WorkspaceSurface | null, browserTitle?: string) {
  if (!surface) return "New tab";
  if (surface === "changes") return "Files changed";
  if (surface === "browser") {
    const title = browserTitle?.trim();
    return title && title !== "New tab" ? `Browser · ${title}` : "Browser";
  }
  return `${surface[0].toUpperCase()}${surface.slice(1)}`;
}

function workspaceSurfaceIcon(surface: WorkspaceSurface | null) {
  if (surface === "browser") return <Globe size={12} />;
  if (surface === "terminal") return <TerminalSquare size={12} />;
  if (surface === "files") return <Files size={12} />;
  if (surface === "changes") return <GitCompareArrows size={12} />;
  return <Bot size={12} />;
}
