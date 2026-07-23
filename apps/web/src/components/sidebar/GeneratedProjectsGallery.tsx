import { useAuthStore, useEntityStore } from "@trace/client-core";
import { useEffect } from "react";
import { gql } from "@urql/core";
import { client } from "../../lib/urql";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { GeneratedProjectGalleryCard } from "./GeneratedProjectGalleryCard";
import { usePdfArtifactPreviewUrls } from "./usePdfArtifactPreviewUrls";
const DESIGN_SYSTEMS_QUERY = gql`
  query GalleryDesignSystems($organizationId: ID!) {
    designSystems(organizationId: $organizationId) {
      id
      authoringSessionGroupId
      archivedAt
      name
      status
    }
  }
`;

export function GeneratedProjectsGallery() {
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const groups = useEntityStore((state) => state.sessionGroups);
  const upsertMany = useEntityStore((state) => state.upsertMany);
  useEffect(() => {
    if (!activeOrgId) return;
    void client
      .query(
        DESIGN_SYSTEMS_QUERY,
        { organizationId: activeOrgId },
        { requestPolicy: "network-only" },
      )
      .toPromise()
      .then((result) => {
        if (!result.error) upsertMany("designSystems", result.data?.designSystems ?? []);
      });
  }, [activeOrgId, upsertMany]);
  const visibleGroups = Object.values(groups)
    .filter(
      (group) =>
        !group.archivedAt &&
        (group.kind === "app" ||
          group.kind === "design" ||
          group.kind === "design_system" ||
          group.kind === "pdf" ||
          group.kind === "animation"),
    )
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const projectGroups = visibleGroups.filter((group) => group.kind !== "design_system");
  const designSystemGroups = visibleGroups.filter((group) => group.kind === "design_system");
  const pdfGroups = projectGroups.filter((group) => group.kind === "pdf");
  const pdfPreviewUrls = usePdfArtifactPreviewUrls(pdfGroups);

  return (
    <div className="flex h-full flex-col">
      <header className="app-region-drag flex h-12 shrink-0 items-center border-b border-border py-0 pl-[var(--trace-header-title-offset)] pr-4 transition-[padding-left] duration-200 ease-in-out">
        <h2 className="text-sm font-semibold text-foreground">Create</h2>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
          <div className="mb-5">
            <h1 className="text-xl font-semibold text-foreground">Your creations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Apps, designs, and documents created by your workspace.
            </p>
          </div>
          {projectGroups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              Your generated projects will appear here.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projectGroups.map((group) => (
                <GeneratedProjectGalleryCard
                  key={group.id}
                  group={group}
                  pdfPreviewUrl={pdfPreviewUrls[group.id]}
                />
              ))}
            </div>
          )}
          <Accordion className="mt-10 border-t border-border">
            <AccordionItem value="design-systems" className="border-b-0">
              <AccordionTrigger className="py-5 hover:no-underline">
                <span className="flex flex-col gap-1">
                  <span className="font-semibold text-foreground">Design systems</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {designSystemGroups.length === 1
                      ? "1 shared system"
                      : `${designSystemGroups.length} shared systems`}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                {designSystemGroups.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                    Your design systems will appear here.
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {designSystemGroups.map((group) => (
                      <GeneratedProjectGalleryCard key={group.id} group={group} />
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </main>
    </div>
  );
}
