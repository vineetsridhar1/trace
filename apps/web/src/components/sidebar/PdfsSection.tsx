import { useEffect, useMemo } from "react";
import { FileText, Plus } from "lucide-react";
import { gql } from "@urql/core";
import type { Session, SessionGroup } from "@trace/gql";
import { useEntityStore, type SessionEntity, type SessionGroupEntity } from "@trace/client-core";
import { client } from "../../lib/urql";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { GeneratedProjectSessionItem } from "./GeneratedProjectSessionItem";

const PDF_SESSION_GROUPS_QUERY = gql`
  query PdfSessionGroups($organizationId: ID!) {
    pdfSessionGroups(organizationId: $organizationId) {
      id name slug kind status visibility archivedAt connection { state }
      sessions { id sessionGroupId agentStatus sessionStatus prUrl worktreeDeleted lastMessageAt lastUserMessageAt updatedAt createdAt }
    }
  }
`;

export function PdfsSection({
  activeOrgId,
  activeSessionGroupId,
}: {
  activeOrgId: string | null;
  activeSessionGroupId: string | null;
}) {
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const groups = useEntityStore((state) => state.sessionGroups);
  const openGeneratedProjectDialog = useCommandPaletteStore(
    (state) => state.openGeneratedProjectDialog,
  );

  useEffect(() => {
    if (!activeOrgId) return;
    let active = true;
    void client.query(PDF_SESSION_GROUPS_QUERY, { organizationId: activeOrgId }, { requestPolicy: "cache-and-network" }).toPromise().then((result) => {
      if (!active) return;
      const pdfGroups = (result.data?.pdfSessionGroups ?? []) as Array<SessionGroup & { id: string; sessions?: Array<Session & { id: string }> }>;
      if (!pdfGroups.length) return;
      upsertMany("sessionGroups", pdfGroups as SessionGroupEntity[]);
      const sessions = pdfGroups.flatMap((group) => group.sessions ?? []);
      if (sessions.length) upsertMany("sessions", sessions as SessionEntity[]);
    });
    return () => { active = false; };
  }, [activeOrgId, upsertMany]);

  const pdfs = useMemo(
    () => Object.values(groups).filter((group) => group.kind === "pdf" && !group.archivedAt).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [groups],
  );

  return (
    <div className="pt-2">
      <div className="group/pdfs-header flex items-center justify-between px-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">PDFs</span>
        <button type="button" title="New PDF" aria-label="New PDF" onClick={() => openGeneratedProjectDialog("pdf")} className="pointer-events-none flex size-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring group-hover/pdfs-header:pointer-events-auto group-hover/pdfs-header:opacity-100 group-focus-within/pdfs-header:pointer-events-auto group-focus-within/pdfs-header:opacity-100">
          <Plus size={14} />
        </button>
      </div>
      {pdfs.length === 0 ? (
        <button type="button" onClick={() => openGeneratedProjectDialog("pdf")} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 pl-4 text-sm text-muted-foreground hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring">
          <FileText size={16} /><span>Create a PDF</span>
        </button>
      ) : (
        <div className="mt-1 space-y-0.5">
          {pdfs.map((group) => <GeneratedProjectSessionItem key={group.id} groupId={group.id} isActive={group.id === activeSessionGroupId} kind="pdf" />)}
        </div>
      )}
    </div>
  );
}
