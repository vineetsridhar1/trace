import { useEntityField } from "@trace/client-core";
import { X } from "lucide-react";
import { artifactDisplay } from "./artifact-display";

export function ArtifactTab({
  artifactId,
  className,
  onRef,
  onSelect,
  onClose,
}: {
  artifactId: string;
  className: string;
  onRef: (key: string, element: HTMLElement | null) => void;
  onSelect: (artifactId: string) => void;
  onClose: (artifactId: string) => void;
}) {
  const type = useEntityField("artifacts", artifactId, "type");
  const { Icon, label } = artifactDisplay(type ?? "");

  return (
    <div ref={(element: HTMLElement | null) => onRef(artifactId, element)} className={className}>
      <button
        type="button"
        onClick={() => onSelect(artifactId)}
        className="inline-flex min-w-0 items-center gap-2 px-3 py-2"
      >
        <Icon size={12} className="shrink-0" />
        <span className="truncate">{label}</span>
      </button>
      <button
        type="button"
        onClick={() => onClose(artifactId)}
        className="mr-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm opacity-60 transition-opacity hover:bg-surface-hover hover:opacity-100"
        title={`Close ${label.toLowerCase()} tab`}
      >
        <X size={12} />
      </button>
    </div>
  );
}
