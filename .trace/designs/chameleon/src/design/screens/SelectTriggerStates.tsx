import { DesignScreen } from "../primitives/DesignScreen";
import { SpecCard, SpecHeader, StateCaption, TokenChip } from "../components/select/Spec";
import { SpecTrigger } from "../components/select/SelectMock";
import { GlobeIcon } from "../components/select/icons";

const SRC = "src/design/screens/SelectTriggerStates.tsx";

export default function SelectTriggerStates() {
  return (
    <DesignScreen data-trace-id="select-trigger-states" data-trace-source={SRC} className="p-10">
      <SpecHeader
        data-trace-id="select-states-header"
        data-trace-source={SRC}
        title="Select — trigger states & sizes"
        description="Seven coded states, two sizes. States are driven by data attributes (data-placeholder, aria-expanded, aria-invalid, data-disabled) — never by per-feature overrides."
      />

      <SpecCard
        data-trace-id="select-states-grid"
        data-trace-source={SRC}
        className="mt-8"
        title="States"
      >
        <div className="grid grid-cols-4 gap-x-6 gap-y-7">
          <div>
            <SpecTrigger data-trace-id="state-placeholder" data-trace-source={SRC} />
            <StateCaption label="Placeholder" note="No value yet · text --muted-foreground" />
          </div>
          <div>
            <SpecTrigger data-trace-id="state-value" data-trace-source={SRC} value="Frankfurt (eu-central-1)" />
            <StateCaption label="Value" note="Text --foreground, matches the item label exactly" />
          </div>
          <div>
            <SpecTrigger data-trace-id="state-hover" data-trace-source={SRC} state="hover" value="Frankfurt (eu-central-1)" />
            <StateCaption label="Hover" note="Border lifts to --surface-hover" />
          </div>
          <div>
            <SpecTrigger data-trace-id="state-focus" data-trace-source={SRC} state="focus" value="Frankfurt (eu-central-1)" />
            <StateCaption label="Focus-visible" note="3px ring in --ring, keyboard only" />
          </div>
          <div>
            <SpecTrigger data-trace-id="state-open" data-trace-source={SRC} state="open" value="Frankfurt (eu-central-1)" />
            <StateCaption label="Open" note="Border --ring · chevron rotates 180°" />
          </div>
          <div>
            <SpecTrigger data-trace-id="state-disabled" data-trace-source={SRC} state="disabled" value="Frankfurt (eu-central-1)" />
            <StateCaption label="Disabled" note="50% opacity · explain why via DisabledTooltip" />
          </div>
          <div>
            <SpecTrigger data-trace-id="state-invalid" data-trace-source={SRC} state="invalid" />
            <p className="mt-1.5 text-xs text-design-danger">Select a region to continue.</p>
            <StateCaption label="Invalid" note="aria-invalid · border + 30% ring in --destructive" />
          </div>
          <div>
            <SpecTrigger
              data-trace-id="state-icon"
              data-trace-source={SRC}
              icon={<GlobeIcon />}
              value="Frankfurt (eu-central-1)"
            />
            <StateCaption label="With leading icon" note="Optional 16px icon slot in --muted-foreground" />
          </div>
        </div>
      </SpecCard>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <SpecCard
          data-trace-id="select-sizes"
          data-trace-source={SRC}
          title="Sizes"
          caption="Two sizes only. Default everywhere; sm inside table rows and dense toolbars."
        >
          <div className="space-y-6">
            <div className="flex items-center gap-5">
              <SpecTrigger data-trace-id="size-default" data-trace-source={SRC} value="Member" className="w-[220px]" />
              <div>
                <p className="font-design-mono text-[11px] uppercase tracking-[0.08em] text-design-foreground">
                  default
                </p>
                <p className="mt-0.5 text-[11px] text-design-muted">32px high · 12px padding · forms, settings, dialogs</p>
              </div>
            </div>
            <div className="flex items-center gap-5">
              <SpecTrigger data-trace-id="size-sm" data-trace-source={SRC} size="sm" value="Member" className="w-[220px]" />
              <div>
                <p className="font-design-mono text-[11px] uppercase tracking-[0.08em] text-design-foreground">
                  sm
                </p>
                <p className="mt-0.5 text-[11px] text-design-muted">28px high · 10px padding · table cells, filter bars</p>
              </div>
            </div>
          </div>
        </SpecCard>

        <SpecCard
          data-trace-id="select-width"
          data-trace-source={SRC}
          title="Width & overflow"
          caption="Width comes from layout, not content: fill the form column or use a fixed width. Long values truncate with an ellipsis — the trigger never grows or wraps."
        >
          <div className="space-y-4">
            <SpecTrigger
              data-trace-id="width-fill"
              data-trace-source={SRC}
              value="Frankfurt (eu-central-1)"
              className="w-full"
            />
            <SpecTrigger
              data-trace-id="width-truncate"
              data-trace-source={SRC}
              value={"Singapore (ap-southeas…"}
              className="w-[240px]"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              <TokenChip>min-w 128px</TokenChip>
              <TokenChip>fill form column by default</TokenChip>
              <TokenChip>truncate, no wrap</TokenChip>
            </div>
          </div>
        </SpecCard>
      </div>
    </DesignScreen>
  );
}
