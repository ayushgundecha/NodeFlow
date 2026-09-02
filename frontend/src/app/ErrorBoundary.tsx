import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { failed: boolean };

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("NodeFlow render failure", { error, componentStack: info.componentStack });
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
          <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold text-blue-700">NodeFlow</p>
            <h1 className="mt-2 text-2xl font-semibold">The canvas could not be loaded.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Your browser state is still local. Reload the page to recover the workspace.
            </p>
            <button
              type="button"
              className="mt-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              onClick={() => { window.location.reload(); }}
            >
              Reload NodeFlow
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
