import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
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

export class PlanRenderErrorBoundary extends Component<Props, State> {
  declare props: Readonly<Props>;
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("Visual plan failed to render", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="my-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <h2 className="text-sm font-semibold text-foreground">Visual plan failed to render</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Trace is still usable. The plan source remains available for revision.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-surface-deep px-3 py-2 text-xs text-destructive">
            {errorMessage(this.state.error)}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
