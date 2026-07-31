import { DesignScreen } from "../primitives/DesignScreen";
import { SpecCard, SpecHeader, TokenChip } from "../components/select/Spec";
import {
  SpecGroupLabel,
  SpecItem,
  SpecMenu,
  SpecScrollButton,
  SpecSeparator,
} from "../components/select/SelectMock";
import {
  CloudIcon,
  EyeIcon,
  MonitorIcon,
  ServerIcon,
  ShieldIcon,
  TrashIcon,
  UserIcon,
} from "../components/select/icons";

const SRC = "src/design/screens/SelectMenuSpec.tsx";

function RowNote({ children, offsetClass }: { children: string; offsetClass: string }) {
  return (
    <p className={`font-design-mono text-[11px] leading-4 text-design-muted ${offsetClass}`}>
      {children}
    </p>
  );
}

export default function SelectMenuSpec() {
  return (
    <DesignScreen data-trace-id="select-menu-spec" data-trace-source={SRC} className="p-10">
      <SpecHeader
        data-trace-id="select-menu-header"
        data-trace-source={SRC}
        title="Select — menu, items, and long lists"
        description="One item recipe: 32px row, pointer highlight, and a reserved trailing check slot so labels never shift. Selects hold a flat single-select list — anything with submenus or commands is a DropdownMenu, not a Select."
      />

      <div className="mt-8 grid grid-cols-3 gap-6">
        <SpecCard
          data-trace-id="menu-item-states"
          data-trace-source={SRC}
          title="Item states"
          caption="Highlight tracks pointer or arrow keys. Selection is only ever the trailing check."
        >
          <div className="flex gap-4">
            <SpecMenu data-trace-id="item-states-menu" data-trace-source={SRC} className="w-[210px] shrink-0">
              <SpecItem>Default</SpecItem>
              <SpecItem highlighted>Highlighted</SpecItem>
              <SpecItem selected>Selected</SpecItem>
              <SpecItem selected highlighted>
                Selected + highlight
              </SpecItem>
              <SpecItem disabled>Disabled</SpecItem>
              <SpecSeparator />
              <SpecItem destructive icon={<TrashIcon />}>
                Delete workspace
              </SpecItem>
            </SpecMenu>
            <div className="flex flex-col pt-[6px]">
              <RowNote offsetClass="h-8 pt-2">--foreground</RowNote>
              <RowNote offsetClass="h-8 pt-2">bg --surface-hover</RowNote>
              <RowNote offsetClass="h-8 pt-2">check 16px</RowNote>
              <RowNote offsetClass="h-8 pt-2">both combine</RowNote>
              <RowNote offsetClass="h-8 pt-2">50% opacity</RowNote>
              <RowNote offsetClass="h-8 pt-4">--destructive + 12% tint</RowNote>
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-design-muted">
            Destructive items appear only in menus that also act (rare for Select) and always sit
            last, below a separator.
          </p>
        </SpecCard>

        <SpecCard
          data-trace-id="menu-groups"
          data-trace-source={SRC}
          title="Groups & icons"
          caption="Group with labels when options exceed ~7 or mix domains. Icons are all-or-none within one menu."
        >
          <div className="flex justify-center">
            <SpecMenu data-trace-id="groups-menu" data-trace-source={SRC} className="w-[220px]">
              <SpecGroupLabel>Workspace roles</SpecGroupLabel>
              <SpecItem icon={<ShieldIcon />}>Admin</SpecItem>
              <SpecItem icon={<UserIcon />} selected highlighted>
                Member
              </SpecItem>
              <SpecItem icon={<EyeIcon />}>Observer</SpecItem>
              <SpecSeparator />
              <SpecGroupLabel>Billing</SpecGroupLabel>
              <SpecItem icon={<ShieldIcon />}>Billing admin</SpecItem>
              <SpecItem icon={<EyeIcon />} disabled>
                Auditor
              </SpecItem>
            </SpecMenu>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <TokenChip>label 12px --muted-foreground</TokenChip>
            <TokenChip>separator --surface-hover</TokenChip>
            <TokenChip>icons 16px, all-or-none</TokenChip>
          </div>
        </SpecCard>

        <SpecCard
          data-trace-id="menu-long-lists"
          data-trace-source={SRC}
          title="Long lists"
          caption="Popup caps at 320px and scrolls; chevron buttons appear at the clipped edge. Above ~12 searchable options, use the Command combobox instead."
        >
          <div className="flex justify-center">
            <SpecMenu data-trace-id="long-list-menu" data-trace-source={SRC} className="w-[220px]">
              <SpecItem icon={<CloudIcon />}>Cloud sandbox</SpecItem>
              <SpecItem icon={<MonitorIcon />} selected>
                ODM2H67-M
              </SpecItem>
              <SpecItem icon={<MonitorIcon />} highlighted>
                Virtual host A
              </SpecItem>
              <SpecItem icon={<ServerIcon />}>build-runner-01</SpecItem>
              <SpecItem icon={<ServerIcon />}>build-runner-02</SpecItem>
              <div className="relative">
                <SpecItem icon={<ServerIcon />} className="opacity-60">
                  build-runner-03
                </SpecItem>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-design-surface" />
              </div>
              <SpecScrollButton direction="down" data-trace-id="long-list-scroll" data-trace-source={SRC} />
            </SpecMenu>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <TokenChip>max-h 320px</TokenChip>
            <TokenChip>min-w = trigger</TokenChip>
            <TokenChip>max-w 320px</TokenChip>
            <TokenChip>selected scrolls into view on open</TokenChip>
          </div>
        </SpecCard>
      </div>

      <SpecCard
        data-trace-id="menu-behavior"
        data-trace-source={SRC}
        className="mt-6"
        title="Placement & behavior"
      >
        <div className="grid grid-cols-4 gap-6 text-xs leading-5 text-design-muted">
          <div>
            <p className="mb-1 font-medium text-design-foreground">Placement</p>
            Opens 4px below the trigger, left-aligned. Flips above when vertical space runs out;
            never covers the trigger.
          </div>
          <div>
            <p className="mb-1 font-medium text-design-foreground">Motion</p>
            In: 150ms fade + scale from 98%, origin top. Out: 100ms fade. Chevron rotates over
            200ms. Honors prefers-reduced-motion.
          </div>
          <div>
            <p className="mb-1 font-medium text-design-foreground">Keyboard</p>
            ↑↓ move highlight, type-ahead jumps, Enter selects, Esc closes and returns focus to the
            trigger.
          </div>
          <div>
            <p className="mb-1 font-medium text-design-foreground">Dismissal</p>
            Selecting an item closes the menu and commits immediately — no Apply step inside a
            Select. Outside click or Esc cancels.
          </div>
        </div>
      </SpecCard>
    </DesignScreen>
  );
}
