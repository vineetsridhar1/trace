import {
  AppWindow,
  BotMessageSquare,
  CodeXml,
  Component,
  FileText,
  Frame,
  Gem,
  type LucideIcon,
} from "lucide-react";
import type { SessionGroupKind } from "@trace/gql";
import { cn } from "../../lib/utils";
import type { HomeCreatableKind } from "./home-kinds";

export const DEFAULT_HOME_KIND: HomeCreatableKind = "general";

export const HOME_KIND_OPTIONS: ReadonlyArray<{
  kind: SessionGroupKind;
  label: string;
  Icon: LucideIcon;
  colorClass: string;
}> = [
  { kind: "general", label: "AI", Icon: BotMessageSquare, colorClass: "text-muted-foreground" },
  { kind: "coding", label: "Code", Icon: CodeXml, colorClass: "text-[var(--th-kind-code)]" },
  { kind: "design", label: "Design", Icon: Frame, colorClass: "text-[var(--th-kind-design)]" },
  { kind: "app", label: "App", Icon: AppWindow, colorClass: "text-[var(--th-kind-app)]" },
  { kind: "pdf", label: "PDF", Icon: FileText, colorClass: "text-[var(--th-kind-pdf)]" },
  {
    kind: "animation",
    label: "Animation",
    Icon: Gem,
    colorClass: "text-[var(--th-kind-animation)]",
  },
  {
    kind: "design_system",
    label: "Design system",
    Icon: Component,
    colorClass: "text-[var(--th-kind-system)]",
  },
];

export const HOME_SELECTABLE_KIND_OPTIONS = HOME_KIND_OPTIONS.filter(
  ({ kind }) => kind !== "general" && kind !== "design_system",
);

export function HomeKindIcon({ kind, className }: { kind: SessionGroupKind; className?: string }) {
  const option = HOME_KIND_OPTIONS.find((candidate) => candidate.kind === kind);
  const Icon = option?.Icon ?? CodeXml;
  return <Icon className={cn(option?.colorClass, className)} aria-hidden="true" />;
}

export function homeKindLabel(kind: SessionGroupKind): string {
  return HOME_KIND_OPTIONS.find((candidate) => candidate.kind === kind)?.label ?? "Code";
}
