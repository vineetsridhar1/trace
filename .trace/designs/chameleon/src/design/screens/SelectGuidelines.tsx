import type { ReactNode } from "react";
import { DesignScreen } from "../primitives/DesignScreen";
import { SpecHeader, VerdictBadge } from "../components/select/Spec";
import { SpecItem, SpecMenu, SpecTrigger } from "../components/select/SelectMock";
import {
  CheckIcon,
  ChevronDownIcon,
  CloudIcon,
  EyeIcon,
  MonitorIcon,
  ShieldIcon,
  UserIcon,
} from "../components/select/icons";

const SRC = "src/design/screens/SelectGuidelines.tsx";

function Rule({
  title,
  note,
  doExample,
  dontExample,
  ...props
}: {
  title: string;
  note: string;
  doExample: ReactNode;
  dontExample: ReactNode;
  "data-trace-id": string;
  "data-trace-source": string;
}) {
  return (
    <section className="rounded-[10px] border border-design-border p-5" {...props}>
      <h2 className="text-[13px] font-semibold text-design-foreground">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-design-muted">{note}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[8px] border border-design-border bg-[var(--surface-mid)] p-4">
          <VerdictBadge kind="do" />
          <div className="mt-3 flex min-h-[96px] items-center justify-center">{doExample}</div>
        </div>
        <div className="rounded-[8px] border border-design-border bg-[var(--surface-mid)] p-4">
          <VerdictBadge kind="dont" />
          <div className="mt-3 flex min-h-[96px] items-center justify-center">{dontExample}</div>
        </div>
      </div>
    </section>
  );
}

/* The “don’t” side reproduces drift observed in the four product screenshots
   supplied with the brief (see design.brief.json references). */
export default function SelectGuidelines() {
  return (
    <DesignScreen data-trace-id="select-guidelines" data-trace-source={SRC} className="p-10">
      <SpecHeader
        data-trace-id="select-guidelines-header"
        data-trace-source={SRC}
        title="Select — usage rules"
        description="The six rules that eliminate today’s drift. Each “don’t” is a pattern currently shipping in the product, reproduced from the audit screenshots."
      />

      <div className="mt-8 grid grid-cols-2 gap-6">
        <Rule
          data-trace-id="rule-trigger-shape"
          data-trace-source={SRC}
          title="One trigger shape"
          note="Every select trigger uses the 6px-radius field recipe. No pill triggers, no borderless text triggers."
          doExample={<SpecTrigger value="tracev2" className="w-[180px]" />}
          dontExample={
            <div className="flex h-9 w-[180px] items-center gap-2 rounded-full bg-design-surface px-4 text-sm text-design-foreground">
              <span className="min-w-0 flex-1 truncate">tracev2</span>
              <ChevronDownIcon className="size-4 shrink-0 text-design-muted" />
            </div>
          }
        />

        <Rule
          data-trace-id="rule-check-slot"
          data-trace-source={SRC}
          title="Check sits in the trailing slot"
          note="Selection is a 16px check in a reserved right-edge slot, so labels align whether or not a row is selected."
          doExample={
            <SpecMenu className="w-[180px]">
              <SpecItem>Admin</SpecItem>
              <SpecItem selected>Member</SpecItem>
              <SpecItem>Observer</SpecItem>
            </SpecMenu>
          }
          dontExample={
            <SpecMenu className="w-[180px]">
              <div className="flex h-8 items-center rounded-[5px] px-2 text-sm text-design-foreground">
                Admin
              </div>
              <div className="flex h-8 items-center gap-1.5 rounded-[5px] bg-[var(--surface-hover)] px-2 text-sm text-design-foreground">
                Member
                <CheckIcon className="size-4" />
              </div>
              <div className="flex h-8 items-center rounded-[5px] px-2 text-sm text-design-foreground">
                Observer
              </div>
            </SpecMenu>
          }
        />

        <Rule
          data-trace-id="rule-value-label"
          data-trace-source={SRC}
          title="Trigger text mirrors the item label"
          note="The closed value is the selected item’s label, character for character — no lowercase raw enum values."
          doExample={<SpecTrigger value="Member" className="w-[180px]" />}
          dontExample={<SpecTrigger value="member" className="w-[180px]" />}
        />

        <Rule
          data-trace-id="rule-selection-tint"
          data-trace-source={SRC}
          title="Highlight is not selection"
          note="Background --surface-hover marks the pointer position only. The selected row is marked by its check, never by a persistent fill."
          doExample={
            <SpecMenu className="w-[180px]">
              <SpecItem highlighted>Cloud</SpecItem>
              <SpecItem selected>ODM2H67-M</SpecItem>
            </SpecMenu>
          }
          dontExample={
            <SpecMenu className="w-[180px]">
              <SpecItem>Cloud</SpecItem>
              <SpecItem selected highlighted>
                ODM2H67-M
              </SpecItem>
            </SpecMenu>
          }
        />

        <Rule
          data-trace-id="rule-icons"
          data-trace-source={SRC}
          title="Icons are all-or-none"
          note="Either every option in a menu carries a 16px leading icon, or none do. Mixed rows break the label column."
          doExample={
            <SpecMenu className="w-[180px]">
              <SpecItem icon={<ShieldIcon />}>Admin</SpecItem>
              <SpecItem icon={<UserIcon />} selected>
                Member
              </SpecItem>
              <SpecItem icon={<EyeIcon />}>Observer</SpecItem>
            </SpecMenu>
          }
          dontExample={
            <SpecMenu className="w-[180px]">
              <SpecItem icon={<ShieldIcon />}>Admin</SpecItem>
              <SpecItem selected>Member</SpecItem>
              <SpecItem icon={<EyeIcon />}>Observer</SpecItem>
            </SpecMenu>
          }
        />

        <Rule
          data-trace-id="rule-flat-list"
          data-trace-source={SRC}
          title="Selects stay flat"
          note="A Select picks one value from one list. Submenus, shortcuts, or command rows mean the surface is a DropdownMenu — use that component instead."
          doExample={
            <SpecMenu className="w-[180px]">
              <SpecItem icon={<CloudIcon />}>Cloud</SpecItem>
              <SpecItem icon={<MonitorIcon />} selected>
                ODM2H67-M
              </SpecItem>
            </SpecMenu>
          }
          dontExample={
            <SpecMenu className="w-[180px]">
              <div className="flex h-8 items-center gap-2 rounded-[5px] px-2 text-sm text-design-foreground">
                <CloudIcon className="size-4 shrink-0 text-design-muted" />
                <span className="min-w-0 flex-1 truncate">Cloud</span>
                <CheckIcon className="size-4 shrink-0" />
                <ChevronDownIcon className="size-4 shrink-0 -rotate-90 text-design-muted" />
              </div>
              <div className="flex h-8 items-center gap-2 rounded-[5px] px-2 text-sm text-design-foreground">
                <MonitorIcon className="size-4 shrink-0 text-design-muted" />
                <span className="min-w-0 flex-1 truncate">ODM2H67-M</span>
                <ChevronDownIcon className="size-4 shrink-0 -rotate-90 text-design-muted" />
              </div>
            </SpecMenu>
          }
        />
      </div>
    </DesignScreen>
  );
}
