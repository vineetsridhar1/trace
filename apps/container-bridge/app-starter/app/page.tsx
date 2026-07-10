export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 px-8 py-10 text-zinc-50">
      <section data-trace-source="app/page.tsx:4" className="mx-auto flex max-w-3xl flex-col gap-6">
        <p className="text-sm text-emerald-300">Trace app session</p>
        <h1 className="text-4xl font-semibold tracking-tight">Build from here</h1>
        <p className="text-zinc-300">
          This starter is ready for full-stack changes. Add routes, API handlers, persistence,
          and UI in the app directory, then run pnpm dev.
        </p>
      </section>
    </main>
  );
}
