import {
  isGeneratedProjectKind,
  type GeneratedProjectKind,
} from "../sidebar/generated-project-types";

export type ProjectWorkspaceKind = GeneratedProjectKind | null;

export function getProjectWorkspaceKind(kind: unknown): ProjectWorkspaceKind {
  return isGeneratedProjectKind(kind) ? kind : null;
}
