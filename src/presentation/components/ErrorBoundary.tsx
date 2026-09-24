import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  title: string;
  body: string;
  reloadLabel: string;
}

interface State {
  hasError: boolean;
}

/**
 * Class component because React only supports error boundaries via
 * componentDidCatch/getDerivedStateFromError — no hook equivalent exists.
 * Wrapped by AppErrorBoundary (a function component) so it can still
 * receive translated strings as props.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }): void {
    // eslint-disable-next-line no-console
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-main center-text">
          <div className="card">
            <h2 style={{ marginTop: 0 }}>{this.props.title}</h2>
            <p className="muted">{this.props.body}</p>
            <button className="btn" onClick={() => window.location.reload()}>
              {this.props.reloadLabel}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
