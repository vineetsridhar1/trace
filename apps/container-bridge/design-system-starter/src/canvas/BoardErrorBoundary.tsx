import { Component, type ErrorInfo, type ReactNode } from "react";

export class BoardErrorBoundary extends Component<
  { boardName: string; children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Design-system board ${this.props.boardName} failed`, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="board-error" role="alert">
          <strong>Board failed to render</strong>
          <span>{this.state.error}</span>
        </section>
      );
    }

    return this.props.children;
  }
}
