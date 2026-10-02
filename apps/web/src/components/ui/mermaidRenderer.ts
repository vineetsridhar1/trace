let renderQueue: Promise<unknown> = Promise.resolve();
let nextDiagramId = 0;

export function renderMermaid(source: string, theme: "dark" | "light"): Promise<string> {
  // Mermaid has global configuration and a shared rendering DOM. Serialize the
  // entire operation so concurrent diagrams cannot change each other's theme.
  const result = renderQueue.then(async () => {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: theme === "dark" ? "dark" : "default",
      fontFamily: "Arial, sans-serif",
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      suppressErrorRendering: true,
      secure: [
        "securityLevel",
        "startOnLoad",
        "maxTextSize",
        "maxEdges",
        "htmlLabels",
        "flowchart",
        "suppressErrorRendering",
      ],
    });

    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.visibility = "hidden";
    document.body.appendChild(container);
    try {
      const { svg } = await mermaid.render(`trace-mermaid-${nextDiagramId++}`, source, container);
      // An image keeps diagram SVG, styles and links isolated from the app DOM.
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } finally {
      container.remove();
    }
  });
  renderQueue = result.catch(() => undefined);
  return result;
}
