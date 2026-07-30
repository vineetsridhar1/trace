import { useMemo } from "react";
import { Component } from "lucide-react";
import { useAuthStore, useEntityStore } from "@trace/client-core";
import { useCommandPaletteStore } from "../../stores/command-palette";
import { useHomeDataStore } from "../../stores/home-data";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Button } from "../ui/button";
import { GeneratedProjectGalleryCard } from "./GeneratedProjectGalleryCard";

export function GeneratedDesignSystemsGallery() {
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const groups = useEntityStore((state) => state.sessionGroups);
  const requestRetry = useHomeDataStore((state) => state.requestRetry);
  const loadStatus = useHomeDataStore((state) =>
    state.organizationId === activeOrgId ? state.generatedStatus : "idle",
  );
  const openGeneratedProjectDialog = useCommandPaletteStore(
    (state) => state.openGeneratedProjectDialog,
  );

  const designSystemGroups = useMemo(
    () =>
      Object.values(groups)
        .filter((group) => !group.archivedAt && group.kind === "design_system")
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),
    [groups],
  );

  return (
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
          <div className="mb-3 flex justify-end">
            <Button variant="outline" onClick={() => openGeneratedProjectDialog("design-system")}>
              <Component className="size-4" />
              New design system
            </Button>
          </div>
          {loadStatus === "error" && designSystemGroups.length === 0 ? (
            <div className="rounded-lg border border-[var(--th-edge)] bg-[var(--th-surface)] p-6 text-sm text-muted-foreground">
              <p>Design systems could not be loaded.</p>
              <button
                type="button"
                onClick={requestRetry}
                className="mt-3 text-xs font-medium text-[var(--th-accent-light)] hover:text-foreground"
              >
                Try again
              </button>
            </div>
          ) : loadStatus === "loading" && designSystemGroups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              Loading design systems…
            </p>
          ) : designSystemGroups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              Create a design system from a source repository and a cloud authoring environment.
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
  );
}
