export function AppPreviewLoadingBar({ error = false }: { error?: boolean }) {
  return (
    <>
      <style>
        {`
          .app-preview-loading-bar {
            animation: app-preview-loading-bar 1.5s ease-in-out infinite;
          }
          @keyframes app-preview-loading-bar {
            0% { transform: translateX(-110%); }
            100% { transform: translateX(320%); }
          }
          @media (prefers-reduced-motion: reduce) {
            .app-preview-loading-bar { animation: none; opacity: .6; }
          }
        `}
      </style>
      <div className="h-0.5 w-full overflow-hidden bg-border/40">
        {error ? (
          <div className="h-full w-full bg-destructive/50" />
        ) : (
          <div className="app-preview-loading-bar h-full w-1/3 rounded-full bg-primary/80" />
        )}
      </div>
    </>
  );
}
