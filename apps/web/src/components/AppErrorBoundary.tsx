import React from "react";

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<
  React.PropsWithChildren,
  AppErrorBoundaryState
> {
  declare props: Readonly<React.PropsWithChildren>;
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Trace app crashed during render", error, errorInfo);
  }

  render() {
    if (!this.state.error) {
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
            {this.state.error.stack ?? this.state.error.message}
          </pre>
        </div>
      </div>
    );
  }
}
