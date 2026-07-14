import { Component, type ErrorInfo, type ReactNode } from "react";

export class ArtboardErrorBoundary extends Component<
  { children: ReactNode; screenName: string },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Design screen ${this.props.screenName} failed`, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center bg-rose-50 p-8 text-center text-sm text-rose-900">
          <div>
            <strong className="block">Screen failed to render</strong>
            <span className="mt-2 block text-rose-700">{this.state.error}</span>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
