import { TraceLoader } from "./trace-loader";

const loaderSizes = [16, 20, 24, 32, 40, 48, 64, 80, 96, 128] as const;

export function TraceLoaderGallery() {
  return (
    <main className="flex min-h-dvh items-center justify-center overflow-auto bg-surface-deep p-8 text-foreground">
      <div className="grid w-full max-w-5xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {loaderSizes.map((size) => (
          <div
            key={size}
            className="flex min-h-40 flex-col items-center justify-center gap-4 rounded-xl border border-border bg-background/80 p-5"
          >
            <TraceLoader size={size} showLabel={false} label={`${size} pixel loader`} />
            <span className="font-mono text-xs text-muted-foreground">{size}px</span>
          </div>
        ))}
      </div>
    </main>
  );
}
