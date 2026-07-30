import React from "react";

interface AppErrorBoundaryState {
  hasError: boolean;
  error: unknown;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message || error.name;
  }
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

export class AppErrorBoundary extends React.Component<
  React.PropsWithChildren,
  AppErrorBoundaryState
> {
  declare props: Readonly<React.PropsWithChildren>;
  state: AppErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    console.error("Trace app crashed during render", error, errorInfo);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-deep px-6">
        <div className="w-full max-w-xl rounded-xl border border-border bg-card p-6 shadow-lg">
          <h1 className="text-lg font-semibold text-foreground">Trace failed to load</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A client-side error occurred during startup.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-md bg-surface px-3 py-2 text-xs text-destructive">
            {errorMessage(this.state.error)}
          </pre>
        </div>
      </div>
    );
  }
}
