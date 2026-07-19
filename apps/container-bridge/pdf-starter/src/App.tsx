import { useMemo, useState } from "react";
import formatSource from "../document.format.json";

type Unit = "mm" | "in";
type DocumentFormat = { width: number; height: number; unit: Unit };

const PRESETS: Array<{ label: string; format: DocumentFormat }> = [
  { label: "A4 portrait", format: { width: 210, height: 297, unit: "mm" } },
  { label: "A4 landscape", format: { width: 297, height: 210, unit: "mm" } },
  { label: "US Letter portrait", format: { width: 8.5, height: 11, unit: "in" } },
  { label: "US Letter landscape", format: { width: 11, height: 8.5, unit: "in" } },
  { label: "Square", format: { width: 8, height: 8, unit: "in" } },
];

function validFormat(value: unknown): DocumentFormat {
  if (!value || typeof value !== "object") return PRESETS[0]!.format;
  const source = value as Partial<DocumentFormat>;
  if (
    typeof source.width !== "number" ||
    typeof source.height !== "number" ||
    source.width <= 0 ||
    source.height <= 0 ||
    (source.unit !== "mm" && source.unit !== "in")
  ) {
    return PRESETS[0]!.format;
  }
  return { width: source.width, height: source.height, unit: source.unit };
}

export function App() {
  const [format, setFormat] = useState<DocumentFormat>(() => validFormat(formatSource));
  const pageSize = `${format.width}${format.unit} ${format.height}${format.unit}`;
  const pageStyle = useMemo(() => `@page { size: ${pageSize}; margin: 0; }`, [pageSize]);

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900 sm:px-8">
      <style>{pageStyle}</style>
      <div className="no-print mx-auto mb-5 flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-stone-700">
          <label className="flex items-center gap-2">
            Page size
          <select
            value={`${format.width}-${format.height}-${format.unit}`}
            onChange={(event) => {
              const next = PRESETS.find(
                ({ format: preset }) => `${preset.width}-${preset.height}-${preset.unit}` === event.target.value,
              );
              if (next) setFormat(next.format);
            }}
            className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
          >
            {PRESETS.map(({ label, format: preset }) => (
              <option key={label} value={`${preset.width}-${preset.height}-${preset.unit}`}>
                {label}
              </option>
            ))}
          </select>
          </label>
          <label className="flex items-center gap-1">
            <span className="sr-only">Page width</span>
            <input
              type="number"
              min="1"
              step="0.1"
              value={format.width}
              onChange={(event) => setFormat((current) => ({ ...current, width: Number(event.target.value) || current.width }))}
              className="w-20 rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
            />
            ×
            <span className="sr-only">Page height</span>
            <input
              type="number"
              min="1"
              step="0.1"
              value={format.height}
              onChange={(event) => setFormat((current) => ({ ...current, height: Number(event.target.value) || current.height }))}
              className="w-20 rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <select
            aria-label="Page unit"
            value={format.unit}
            onChange={(event) => setFormat((current) => ({ ...current, unit: event.target.value as Unit }))}
            className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="mm">mm</option>
            <option value="in">in</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
        >
          Download PDF
        </button>
      </div>
      <article
        className="document mx-auto bg-white px-[18mm] py-[20mm] shadow-sm"
        style={{ width: `${format.width}${format.unit}`, minHeight: `${format.height}${format.unit}` }}
      >
        <header className="border-b border-stone-200 pb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Trace document</p>
          <h1 className="mt-4 max-w-xl text-5xl font-semibold tracking-tight text-stone-950">Your document starts here.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-600">
            Describe the document you need, then refine it together in the live preview. When it is ready, use Download PDF to save a print-ready copy.
          </p>
        </header>
        <section className="mt-12 break-inside-avoid">
          <h2 className="text-xl font-semibold text-stone-950">A focused starting point</h2>
          <p className="mt-3 text-base leading-7 text-stone-700">
            This starter is intentionally simple: it is a single responsive document with print styles, not an application. Ask Trace to turn it into a proposal, report, handbook, flyer, or any other polished PDF.
          </p>
        </section>
        <section className="mt-10 grid gap-5 sm:grid-cols-2">
          <div className="break-inside-avoid rounded-lg border border-stone-200 p-5">
            <p className="text-sm font-semibold text-stone-950">Built for paper</p>
            <p className="mt-2 text-sm leading-6 text-stone-600">A4 dimensions, readable type, and print-aware page flow are ready from the first edit.</p>
          </div>
          <div className="break-inside-avoid rounded-lg border border-stone-200 p-5">
            <p className="text-sm font-semibold text-stone-950">Built to change</p>
            <p className="mt-2 text-sm leading-6 text-stone-600">The document remains ordinary HTML and CSS, so the agent can reshape every word and visual detail.</p>
          </div>
        </section>
      </article>
    </main>
  );
}
