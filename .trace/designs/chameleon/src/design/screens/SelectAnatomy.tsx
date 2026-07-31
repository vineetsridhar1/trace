import type { ReactNode } from "react";
import { DesignScreen } from "../primitives/DesignScreen";
import { SpecCard, SpecHeader, TokenChip } from "../components/select/Spec";
import {
  SpecGroupLabel,
  SpecItem,
  SpecMenu,
  SpecScrollButton,
  SpecSeparator,
  SpecTrigger,
} from "../components/select/SelectMock";
import { CloudIcon, MonitorIcon, ServerIcon } from "../components/select/icons";

const SRC = "src/design/screens/SelectAnatomy.tsx";

function Marker({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={`absolute z-10 flex size-[18px] items-center justify-center rounded-full bg-design-primary font-design-mono text-[11px] font-semibold leading-none text-design-primary-foreground ${className ?? ""}`}
    >
      {n}
    </span>
  );
}

function LegendRow({ n, name, detail }: { n: number; name: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-design-primary font-design-mono text-[11px] font-semibold leading-none text-design-primary-foreground">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium leading-[18px] text-design-foreground">{name}</p>
        <p className="mt-0.5 font-design-mono text-[11px] leading-4 text-design-muted">{detail}</p>
      </div>
    </div>
  );
}

function TokenCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-design-muted">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Swatch({ varName }: { varName: string }) {
  return (
    <span
      className="mr-1 inline-block size-3 shrink-0 rounded-[3px] border border-[var(--surface-hover)] align-[-1px]"
      style={{ background: `var(${varName})` }}
    />
  );
}

export default function SelectAnatomy() {
  return (
    <DesignScreen data-trace-id="select-anatomy" data-trace-source={SRC} className="p-10">
      <SpecHeader
        data-trace-id="select-anatomy-header"
        data-trace-source={SRC}
        title="Select — anatomy"
        description="One Select for every dropdown that picks a single value. Trigger and menu are fixed recipes built from tracev2 tokens; only width, size (default / sm), and the optional leading icon vary per use."
      />

      <div className="mt-8 grid grid-cols-[5fr_7fr] gap-6">
        <SpecCard
          data-trace-id="select-anatomy-trigger-card"
          data-trace-source={SRC}
          title="Trigger"
          caption="Closed field. Identical recipe at rest in forms, tables, and toolbars."
        >
          <div className="flex justify-center py-8">
            <div className="relative">
              <SpecTrigger
                data-trace-id="select-anatomy-trigger"
                data-trace-source={SRC}
                icon={<CloudIcon />}
                value="Cloud sandbox"
                className="w-[260px]"
              />
              <Marker n={1} className="-left-2 -top-2" />
              <Marker n={2} className="-bottom-2 left-[30px]" />
              <Marker n={3} className="-bottom-2 left-[120px]" />
              <Marker n={4} className="-top-2 right-1" />
            </div>
          </div>
          <div className="divide-y divide-design-border border-t border-design-border">
            <LegendRow
              n={1}
              name="Container"
              detail="h 32 (sm 28) · px 12 (sm 10) · radius 6 --radius-md · bg --input · border 1 --border"
            />
            <LegendRow
              n={2}
              name="Leading icon — optional"
              detail="16 px · --muted-foreground · gap 8 to value"
            />
            <LegendRow
              n={3}
              name="Value / placeholder"
              detail="14 px --foreground · placeholder --muted-foreground · truncates, never wraps"
            />
            <LegendRow
              n={4}
              name="Chevron"
              detail="chevron-down 16 px · --muted-foreground · rotates 180° while open"
            />
          </div>
        </SpecCard>

        <SpecCard
          data-trace-id="select-anatomy-menu-card"
          data-trace-source={SRC}
          title="Open menu"
          caption="Popup opens 4 px below the trigger, at least as wide as it, and closes on selection."
        >
          <div className="grid grid-cols-[260px_1fr] gap-8 py-2">
            <div className="relative">
              <SpecTrigger
                data-trace-id="select-anatomy-open-trigger"
                data-trace-source={SRC}
                state="open"
                icon={<CloudIcon />}
                value="Cloud sandbox"
                className="w-[260px]"
              />
              <div className="relative mt-1">
                <SpecMenu data-trace-id="select-anatomy-menu" data-trace-source={SRC} className="w-[260px]">
                  <SpecGroupLabel>Environments</SpecGroupLabel>
                  <SpecItem icon={<CloudIcon />} selected>
                    Cloud sandbox
                  </SpecItem>
                  <SpecItem icon={<MonitorIcon />} highlighted>
                    ODM2H67-M
                  </SpecItem>
                  <SpecSeparator />
                  <SpecGroupLabel>Remote</SpecGroupLabel>
                  <SpecItem icon={<ServerIcon />}>build-runner-02</SpecItem>
                  <SpecItem icon={<ServerIcon />}>build-runner-03</SpecItem>
                  <SpecScrollButton direction="down" />
                </SpecMenu>
                <Marker n={5} className="right-1 top-1" />
                <Marker n={6} className="-left-2 top-[10px]" />
                <Marker n={7} className="-left-2 top-[40px]" />
                <Marker n={8} className="right-1 top-[70px]" />
                <Marker n={9} className="right-[26px] top-[36px]" />
                <Marker n={10} className="-bottom-2 left-[121px]" />
              </div>
            </div>
            <div className="divide-y divide-design-border">
              <LegendRow
                n={5}
                name="Popup"
                detail="bg --surface · radius 8 --radius-lg · padding 4 · shadow --shadow · min-w = trigger · max-h 320"
              />
              <LegendRow n={6} name="Group label" detail="12 px · --muted-foreground · px 8 · py 6" />
              <LegendRow
                n={7}
                name="Item (highlighted below)"
                detail="h 32 · px 8 · radius 5 --radius-sm · gap 8 · highlight bg --surface-hover"
              />
              <LegendRow
                n={8}
                name="Highlight"
                detail="follows pointer / arrow keys · never persists after close"
              />
              <LegendRow
                n={9}
                name="Check — selection"
                detail="check 16 px --foreground · trailing slot reserved on every item"
              />
              <LegendRow
                n={10}
                name="Scroll button"
                detail="h 24 · chevron 16 px --muted-foreground · shown only when the list overflows"
              />
            </div>
          </div>
        </SpecCard>
      </div>

      <SpecCard
        data-trace-id="select-anatomy-tokens"
        data-trace-source={SRC}
        className="mt-6"
        title="Token map"
        caption="Every value resolves to the tracev2 package; nothing is styled per feature. Separators inside the popup use --surface-hover because --border matches the popup fill."
      >
        <div className="grid grid-cols-4 gap-6">
          <TokenCell label="Surfaces">
            <TokenChip>
              <Swatch varName="--input" />
              --input
            </TokenChip>
            <TokenChip>
              <Swatch varName="--surface" />
              --surface
            </TokenChip>
            <TokenChip>
              <Swatch varName="--surface-hover" />
              --surface-hover
            </TokenChip>
          </TokenCell>
          <TokenCell label="Text & icons">
            <TokenChip>
              <Swatch varName="--foreground" />
              --foreground
            </TokenChip>
            <TokenChip>
              <Swatch varName="--muted-foreground" />
              --muted-foreground
            </TokenChip>
            <TokenChip>text-sm 14px</TokenChip>
          </TokenCell>
          <TokenCell label="Shape & focus">
            <TokenChip>--radius-md 6px</TokenChip>
            <TokenChip>--radius-lg 8px</TokenChip>
            <TokenChip>
              <Swatch varName="--ring" />
              ring 3px --ring
            </TokenChip>
          </TokenCell>
          <TokenCell label="Motion">
            <TokenChip>open 150ms fade + 2% scale</TokenChip>
            <TokenChip>chevron 200ms ease</TokenChip>
          </TokenCell>
        </div>
      </SpecCard>
    </DesignScreen>
  );
}
