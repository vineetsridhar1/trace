import type { ComponentType, SVGProps } from "react";
import { File, FileCode, FileJson, FileText, Image, Settings, type LucideIcon } from "lucide-react";
import BashOriginal from "devicons-react/icons/BashOriginal";
import COriginal from "devicons-react/icons/COriginal";
import CplusplusOriginal from "devicons-react/icons/CplusplusOriginal";
import CsharpOriginal from "devicons-react/icons/CsharpOriginal";
import Css3Original from "devicons-react/icons/Css3Original";
import DockerOriginal from "devicons-react/icons/DockerOriginal";
import GitOriginal from "devicons-react/icons/GitOriginal";
import GoOriginal from "devicons-react/icons/GoOriginal";
import Html5Original from "devicons-react/icons/Html5Original";
import JavaOriginal from "devicons-react/icons/JavaOriginal";
import JavascriptOriginal from "devicons-react/icons/JavascriptOriginal";
import JsonOriginal from "devicons-react/icons/JsonOriginal";
import KotlinOriginal from "devicons-react/icons/KotlinOriginal";
import MarkdownOriginal from "devicons-react/icons/MarkdownOriginal";
import NpmOriginal from "devicons-react/icons/NpmOriginal";
import PhpOriginal from "devicons-react/icons/PhpOriginal";
import PnpmOriginal from "devicons-react/icons/PnpmOriginal";
import PythonOriginal from "devicons-react/icons/PythonOriginal";
import ReactOriginal from "devicons-react/icons/ReactOriginal";
import RubyOriginal from "devicons-react/icons/RubyOriginal";
import RustOriginal from "devicons-react/icons/RustOriginal";
import SassOriginal from "devicons-react/icons/SassOriginal";
import SwiftOriginal from "devicons-react/icons/SwiftOriginal";
import TypescriptOriginal from "devicons-react/icons/TypescriptOriginal";
import VuejsOriginal from "devicons-react/icons/VuejsOriginal";
import XmlOriginal from "devicons-react/icons/XmlOriginal";
import YamlOriginal from "devicons-react/icons/YamlOriginal";
import YarnOriginal from "devicons-react/icons/YarnOriginal";
import { cn } from "../../lib/utils";

type DeviconComponent = ComponentType<SVGProps<SVGElement> & { size?: number | string }>;
type FileIconEntry =
  | { kind: "devicon"; Icon: DeviconComponent }
  | { kind: "lucide"; Icon: LucideIcon; className: string };

const FILE_ICON_BY_BASENAME: Record<string, FileIconEntry> = {
  ".gitignore": { kind: "devicon", Icon: GitOriginal },
  ".npmrc": { kind: "devicon", Icon: NpmOriginal },
  "docker-compose.yaml": { kind: "devicon", Icon: DockerOriginal },
  "docker-compose.yml": { kind: "devicon", Icon: DockerOriginal },
  dockerfile: { kind: "devicon", Icon: DockerOriginal },
  "package-lock.json": { kind: "devicon", Icon: NpmOriginal },
  "package.json": { kind: "devicon", Icon: NpmOriginal },
  "pnpm-lock.yaml": { kind: "devicon", Icon: PnpmOriginal },
  "yarn.lock": { kind: "devicon", Icon: YarnOriginal },
};

const FILE_ICON_BY_EXTENSION: Record<string, FileIconEntry> = {
  c: { kind: "devicon", Icon: COriginal },
  cc: { kind: "devicon", Icon: CplusplusOriginal },
  cpp: { kind: "devicon", Icon: CplusplusOriginal },
  cs: { kind: "devicon", Icon: CsharpOriginal },
  css: { kind: "devicon", Icon: Css3Original },
  go: { kind: "devicon", Icon: GoOriginal },
  h: { kind: "devicon", Icon: COriginal },
  html: { kind: "devicon", Icon: Html5Original },
  java: { kind: "devicon", Icon: JavaOriginal },
  js: { kind: "devicon", Icon: JavascriptOriginal },
  json: { kind: "devicon", Icon: JsonOriginal },
  jsonc: { kind: "devicon", Icon: JsonOriginal },
  jsx: { kind: "devicon", Icon: ReactOriginal },
  kt: { kind: "devicon", Icon: KotlinOriginal },
  md: { kind: "devicon", Icon: MarkdownOriginal },
  mdx: { kind: "devicon", Icon: MarkdownOriginal },
  php: { kind: "devicon", Icon: PhpOriginal },
  py: { kind: "devicon", Icon: PythonOriginal },
  rb: { kind: "devicon", Icon: RubyOriginal },
  rs: { kind: "devicon", Icon: RustOriginal },
  sass: { kind: "devicon", Icon: SassOriginal },
  scss: { kind: "devicon", Icon: SassOriginal },
  sh: { kind: "devicon", Icon: BashOriginal },
  swift: { kind: "devicon", Icon: SwiftOriginal },
  ts: { kind: "devicon", Icon: TypescriptOriginal },
  tsx: { kind: "devicon", Icon: ReactOriginal },
  vue: { kind: "devicon", Icon: VuejsOriginal },
  xml: { kind: "devicon", Icon: XmlOriginal },
  yaml: { kind: "devicon", Icon: YamlOriginal },
  yml: { kind: "devicon", Icon: YamlOriginal },
};

const FALLBACK_FILE_ICONS: Record<string, FileIconEntry> = {
  code: { kind: "lucide", Icon: FileCode, className: "text-blue-300" },
  config: { kind: "lucide", Icon: Settings, className: "text-muted-foreground" },
  image: { kind: "lucide", Icon: Image, className: "text-green-300" },
  json: { kind: "lucide", Icon: FileJson, className: "text-yellow-300" },
  text: { kind: "lucide", Icon: FileText, className: "text-blue-300" },
  unknown: { kind: "lucide", Icon: File, className: "text-muted-foreground" },
};

function fileIconEntryForPath(path: string): FileIconEntry {
  const basename = path.split("/").pop()?.toLowerCase() ?? path.toLowerCase();
  const basenameIcon = FILE_ICON_BY_BASENAME[basename];
  if (basenameIcon) return basenameIcon;

  const ext = basename.split(".").pop()?.toLowerCase();
  if (!ext || ext === basename) return FALLBACK_FILE_ICONS.unknown;

  const extensionIcon = FILE_ICON_BY_EXTENSION[ext];
  if (extensionIcon) return extensionIcon;

  if (["png", "jpg", "jpeg", "gif", "svg", "ico", "webp"].includes(ext)) {
    return FALLBACK_FILE_ICONS.image;
  }
  if (["txt", "rst"].includes(ext)) return FALLBACK_FILE_ICONS.text;
  if (["toml", "ini", "env", "conf"].includes(ext)) return FALLBACK_FILE_ICONS.config;
  if (["svelte", "less"].includes(ext)) return FALLBACK_FILE_ICONS.code;

  return FALLBACK_FILE_ICONS.unknown;
}

interface FileIconProps {
  path: string;
  size?: number;
  className?: string;
}

export function FileIcon({ path, size = 16, className }: FileIconProps) {
  const entry = fileIconEntryForPath(path);
  const Icon = entry.Icon;

  if (entry.kind === "devicon") {
    return <Icon aria-hidden="true" size={size} className={cn("shrink-0", className)} />;
  }

  return (
    <Icon aria-hidden="true" size={size} className={cn("shrink-0", entry.className, className)} />
  );
}
