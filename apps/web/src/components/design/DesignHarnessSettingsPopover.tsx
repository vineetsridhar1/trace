import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { Check, Loader2, Palette } from "lucide-react";
import type { DesignPromptContentCatalog } from "@trace/gql";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

const NONE_DESIGN_SYSTEM = "__none__";

const DESIGN_PROMPT_CONTENT_CATALOG_QUERY = gql`
  query DesignPromptContentCatalog {
    designPromptContentCatalog {
      designSystems {
        id
        name
        description
      }
      skills {
        id
        title
        description
      }
    }
  }
`;

const UPDATE_DESIGN_HARNESS_SETTINGS_MUTATION = gql`
  mutation UpdateDesignHarnessSettings(
    $sessionGroupId: ID!
    $designSystemId: String
    $designSkillIds: [String!]
  ) {
    updateDesignHarnessSettings(
      sessionGroupId: $sessionGroupId
      designSystemId: $designSystemId
      designSkillIds: $designSkillIds
    ) {
      id
    }
  }
`;

type CatalogResult = {
  designPromptContentCatalog?: DesignPromptContentCatalog;
};

type DesignHarnessSettingsPopoverProps = {
  sessionGroupId: string;
  designSystemId?: string | null;
  designSkillIds?: string[] | null;
  triggerClassName?: string;
};

export function toggleDesignSkillId(skillIds: readonly string[], skillId: string): string[] {
  return skillIds.includes(skillId)
    ? skillIds.filter((id) => id !== skillId)
    : [...skillIds, skillId];
}

export function designHarnessSummary(input: {
  designSystemId?: string | null;
  designSkillIds?: readonly string[] | null;
  catalog?: DesignPromptContentCatalog | null;
}): string {
  const designSystemName =
    input.catalog?.designSystems.find((system) => system.id === input.designSystemId)?.name ??
    input.designSystemId ??
    "Default";
  const skillCount = input.designSkillIds?.length ?? 0;
  return skillCount > 0 ? `${designSystemName} + ${skillCount}` : designSystemName;
}

export function DesignHarnessSettingsPopover({
  sessionGroupId,
  designSystemId,
  designSkillIds,
  triggerClassName,
}: DesignHarnessSettingsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<DesignPromptContentCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftDesignSystemId, setDraftDesignSystemId] = useState<string | null>(
    designSystemId ?? null,
  );
  const [draftSkillIds, setDraftSkillIds] = useState<string[]>(designSkillIds ?? []);

  useEffect(() => {
    setDraftDesignSystemId(designSystemId ?? null);
    setDraftSkillIds(designSkillIds ?? []);
  }, [designSkillIds, designSystemId]);

  useEffect(() => {
    if (!open || catalog || loading) return;
    setLoading(true);
    void client
      .query<CatalogResult>(DESIGN_PROMPT_CONTENT_CATALOG_QUERY, {})
      .toPromise()
      .then((result) => {
        if (result.error) {
          toast.error("Design settings unavailable", { description: result.error.message });
          return;
        }
        setCatalog(result.data?.designPromptContentCatalog ?? null);
      })
      .finally(() => setLoading(false));
  }, [catalog, loading, open]);

  const summary = useMemo(
    () => designHarnessSummary({ designSystemId, designSkillIds, catalog }),
    [catalog, designSkillIds, designSystemId],
  );

  const dirty = useMemo(() => {
    const currentSkillIds = designSkillIds ?? [];
    return (
      (designSystemId ?? null) !== draftDesignSystemId ||
      currentSkillIds.length !== draftSkillIds.length ||
      currentSkillIds.some((id, index) => id !== draftSkillIds[index])
    );
  }, [designSkillIds, designSystemId, draftDesignSystemId, draftSkillIds]);

  const handleToggleSkill = useCallback((skillId: string) => {
    setDraftSkillIds((current) => toggleDesignSkillId(current, skillId));
  }, []);

  const handleSave = useCallback(() => {
    setSaving(true);
    void client
      .mutation(UPDATE_DESIGN_HARNESS_SETTINGS_MUTATION, {
        sessionGroupId,
        designSystemId: draftDesignSystemId,
        designSkillIds: draftSkillIds,
      })
      .toPromise()
      .then((result) => {
        if (result.error) {
          toast.error("Design settings failed", { description: result.error.message });
          return;
        }
        toast.success("Design settings saved");
        setOpen(false);
      })
      .finally(() => setSaving(false));
  }, [draftDesignSystemId, draftSkillIds, sessionGroupId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "inline-flex h-8 min-w-8 max-w-44 items-center gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground",
          triggerClassName,
        )}
        aria-label="Design settings"
        title="Design settings"
      >
        <Palette size={14} />
        <span className="truncate">{summary}</span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 gap-3 rounded-md"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Design settings</div>
            <div className="truncate text-xs text-muted-foreground">{summary}</div>
          </div>
          {loading ? (
            <Loader2 size={14} className="shrink-0 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="design-system">
            Design system
          </label>
          <Select
            value={draftDesignSystemId ?? NONE_DESIGN_SYSTEM}
            onValueChange={(value) =>
              setDraftDesignSystemId(value === NONE_DESIGN_SYSTEM ? null : value)
            }
            disabled={loading || saving}
          >
            <SelectTrigger id="design-system" className="w-full">
              <SelectValue placeholder="Default" />
            </SelectTrigger>
            <SelectContent align="start" className="max-h-72">
              <SelectItem value={NONE_DESIGN_SYSTEM}>Default</SelectItem>
              {catalog?.designSystems.map((system) => (
                <SelectItem key={system.id} value={system.id}>
                  <span className="truncate">{system.name ?? system.id}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <div className="text-xs font-medium text-muted-foreground">Skills</div>
          <div className="max-h-48 overflow-y-auto rounded-md border p-1">
            {catalog?.skills.length ? (
              catalog.skills.map((skill) => {
                const checked = draftSkillIds.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => handleToggleSkill(skill.id)}
                    disabled={saving}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-surface-hover disabled:opacity-50"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-transparent",
                      )}
                    >
                      <Check size={12} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{skill.title ?? skill.id}</span>
                  </button>
                );
              })
            ) : (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                {loading ? "Loading skills" : "No configured skills"}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-8 items-center rounded-md px-2.5 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="inline-flex h-8 items-center rounded-md bg-primary px-2.5 text-xs text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
            Save
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
