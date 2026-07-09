import { storage } from "../lib/storage/index.js";
import { DESIGN_ARTIFACT_CONTENT_TYPE } from "./design-artifact-html.js";

export type DesignArtifactHtmlSource = {
  id: string;
  organizationId: string;
  html: string;
  htmlStorageKey?: string | null;
};

export function buildDesignArtifactHtmlStorageKey(input: {
  organizationId: string;
  artifactId: string;
}) {
  return `uploads/${input.organizationId}/design-artifacts/${input.artifactId}.html`;
}

export async function storeDesignArtifactHtml(input: {
  organizationId: string;
  artifactId: string;
  html: string;
}) {
  const key = buildDesignArtifactHtmlStorageKey(input);
  await storage.putObject(key, Buffer.from(input.html, "utf8"), DESIGN_ARTIFACT_CONTENT_TYPE);
  return key;
}

export async function resolveDesignArtifactHtml(artifact: DesignArtifactHtmlSource) {
  if (!artifact.htmlStorageKey) return artifact.html;
  const body = await storage.getObject(artifact.htmlStorageKey);
  return body.toString("utf8");
}

export async function hydrateDesignArtifactHtml<T extends DesignArtifactHtmlSource>(
  artifact: T,
): Promise<T> {
  const html = await resolveDesignArtifactHtml(artifact);
  return { ...artifact, html };
}
