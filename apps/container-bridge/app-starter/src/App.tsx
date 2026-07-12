export function App() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 px-5 py-8 text-zinc-50 sm:px-8 sm:py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.09),transparent_28%)]" />

      <section
        data-trace-source="src/App.tsx:7"
        className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-between rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/20 backdrop-blur sm:min-h-[calc(100vh-6rem)] sm:p-10"
      >
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-400 font-semibold text-zinc-950">
              T
            </span>
            <span className="font-medium tracking-tight">Your Trace app</span>
          </div>
          <div
            className="flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-medium text-emerald-200"
            role="status"
          >
            <span className="size-1.5 rounded-full bg-emerald-300" />
            Live preview
          </div>
        </header>

        <div className="my-14 max-w-3xl sm:my-20">
          <p className="mb-4 text-sm font-medium text-emerald-300">Ready when you are</p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.035em] sm:text-6xl">
            Your idea starts here.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg sm:leading-8">
            Describe what you want in your own words. Trace will build it in this space, and you can
            shape every detail as it comes together.
          </p>
        </div>

        <div data-trace-source="src/App.tsx:37" className="grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <span className="mb-8 flex size-7 items-center justify-center rounded-full bg-white/10 text-xs text-zinc-300">
              1
            </span>
            <h2 className="font-medium">Describe the outcome</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Share the problem, audience, or feeling you have in mind. No technical language
              needed.
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <span className="mb-8 flex size-7 items-center justify-center rounded-full bg-white/10 text-xs text-zinc-300">
              2
            </span>
            <h2 className="font-medium">Shape it together</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Ask for changes or select something in the preview to make your feedback specific.
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <span className="mb-8 flex size-7 items-center justify-center rounded-full bg-white/10 text-xs text-zinc-300">
              3
            </span>
            <h2 className="font-medium">Share when it feels right</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Keep refining for as long as you like, then publish a link when you are ready.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
