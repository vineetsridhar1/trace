import { FileText } from "lucide-react";
import { TraceLoader } from "../ui/trace-loader";
import { useVisualPlanDocument } from "./useVisualPlanDocument";

export function PlanArtifactPage({ artifactId }: { artifactId: string }) {
  const { html, error } = useVisualPlanDocument(artifactId);

  return (
    <main className="flex h-dvh min-h-dvh flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface px-4">
        <FileText className="size-4 text-accent" />
        <h1 className="text-sm font-medium">Implementation plan</h1>
      </header>
      {error ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : html === null ? (
        <div className="flex flex-1 items-center justify-center">
          <TraceLoader label="Loading plan" size={48} />
        </div>
      ) : (
        <iframe
          title="Implementation plan"
          srcDoc={html}
          sandbox=""
          className="min-h-0 flex-1 border-0 bg-background"
        />
      )}
    </main>
  );
}
