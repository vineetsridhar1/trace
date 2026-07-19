import { useEffect, useMemo, useState } from "react";
import formatSource from "../document.format.json";

type Unit = "mm" | "in";
type DocumentFormat = { width: number; height: number; unit: Unit };

const DEFAULT_FORMAT: DocumentFormat = { width: 210, height: 297, unit: "mm" };

function validFormat(value: unknown): DocumentFormat {
  if (!value || typeof value !== "object") return DEFAULT_FORMAT;
  const source = value as Partial<DocumentFormat>;
  if (
    typeof source.width !== "number" ||
    typeof source.height !== "number" ||
    source.width <= 0 ||
    source.height <= 0 ||
    (source.unit !== "mm" && source.unit !== "in")
  ) {
    return DEFAULT_FORMAT;
  }
  return { width: source.width, height: source.height, unit: source.unit };
}

export function App() {
  const [format, setFormat] = useState<DocumentFormat>(() => validFormat(formatSource));
  const pageSize = `${format.width}${format.unit} ${format.height}${format.unit}`;
  const pageStyle = useMemo(() => `@page { size: ${pageSize}; margin: 0; }`, [pageSize]);

  useEffect(() => {
    const receiveMessage = (event: MessageEvent<unknown>) => {
      if (!event.data || typeof event.data !== "object") return;
      const message = event.data as { source?: unknown; type?: unknown; format?: unknown };
      if (message.source !== "trace") return;
      if (message.type === "pdf:format") setFormat(validFormat(message.format));
    };
    window.addEventListener("message", receiveMessage);
    return () => window.removeEventListener("message", receiveMessage);
  }, []);

  useEffect(() => {
    const reportSize = () => {
      window.parent.postMessage(
        {
          source: "trace-pdf-preview",
          type: "content-size",
          height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
        },
        "*",
      );
    };
    const observer = new ResizeObserver(reportSize);
    observer.observe(document.body);
    reportSize();
    window.addEventListener("load", reportSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("load", reportSize);
    };
  }, []);

  return (
    <main className="min-h-screen bg-white text-stone-900">
      <style>{pageStyle}</style>
      <article
        className="document bg-white px-[18mm] py-[20mm]"
        style={{
          width: `${format.width}${format.unit}`,
          minHeight: `${format.height}${format.unit}`,
        }}
      >
        <header className="border-b border-stone-200 pb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
            Trace document
          </p>
          <h1 className="mt-4 max-w-xl text-5xl font-semibold tracking-tight text-stone-950">
            Your document starts here.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-600">
            Describe the document you need, then refine it together in the live preview. When it is
            ready, Trace will render and store a print-ready copy from the latest pushed commit.
          </p>
        </header>
        <section className="mt-12 break-inside-avoid">
          <h2 className="text-xl font-semibold text-stone-950">A focused starting point</h2>
          <p className="mt-3 text-base leading-7 text-stone-700">
            This starter is intentionally simple: it is a single responsive document with print
            styles, not an application. Ask Trace to turn it into a proposal, report, handbook,
            flyer, or any other polished PDF.
          </p>
        </section>
        <section className="mt-10 grid gap-5 sm:grid-cols-2">
          <div className="break-inside-avoid rounded-lg border border-stone-200 p-5">
            <p className="text-sm font-semibold text-stone-950">Built for paper</p>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              A4 dimensions, readable type, and print-aware page flow are ready from the first edit.
            </p>
          </div>
          <div className="break-inside-avoid rounded-lg border border-stone-200 p-5">
            <p className="text-sm font-semibold text-stone-950">Built to change</p>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              The document remains ordinary HTML and CSS, so the agent can reshape every word and
              visual detail.
            </p>
          </div>
        </section>
      </article>
    </main>
  );
}
