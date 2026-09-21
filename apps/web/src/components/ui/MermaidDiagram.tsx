import { useEffect, useState } from "react";
import { useThemeStore } from "../../stores/theme";
import { renderMermaid } from "./mermaidRenderer";

export function MermaidDiagram({ source }: { source: string }) {
  const theme = useThemeStore((state) => state.theme);
  const [result, setResult] = useState<{
    source: string;
    theme: string;
    image?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Streaming responses may change the source on every token.
    const timeout = setTimeout(() => {
      void renderMermaid(source, theme).then(
        (image) => {
          if (!cancelled) setResult({ source, theme, image });
        },
        () => {
          if (!cancelled) setResult({ source, theme });
        },
      );
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [source, theme]);

  const current = result?.source === source && result.theme === theme ? result : null;
  const code = (
    <pre>
      <code className="language-mermaid">{source}</code>
    </pre>
  );

  return (
    <div className="my-3 rounded-md border border-border bg-surface-deep p-3">
      {current?.image ? (
        <>
          <div className="overflow-x-auto">
            <img src={current.image} alt="Mermaid diagram" className="mx-auto max-w-full" />
          </div>
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Diagram source</summary>
            {code}
          </details>
        </>
      ) : (
        <>
          <div className="text-xs text-muted-foreground" role="status">
            {current ? "Unable to render diagram. Showing source." : "Rendering diagram…"}
          </div>
          {code}
        </>
      )}
    </div>
  );
}
