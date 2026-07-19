export function App() {
  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900 sm:px-8">
      <div className="no-print mx-auto mb-5 flex max-w-[210mm] justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
        >
          Download PDF
        </button>
      </div>
      <article className="document mx-auto min-h-[297mm] max-w-[210mm] bg-white px-[18mm] py-[20mm] shadow-sm">
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
