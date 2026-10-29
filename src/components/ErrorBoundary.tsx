import { Component, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { logDiagnostic } from "../diagnostics";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleQuit = () => {
    invoke("quit_app").catch((e) => {
      logDiagnostic("ErrorBoundary.quit", { error: String(e) });
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100dvh",
            padding: 24,
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
            background: "var(--bg-base)",
            color: "var(--text-primary)",
          }}
        >
          <h2>Something went wrong</h2>
          <p
            style={{
              color: "var(--text-dim)",
              fontSize: 13,
              maxWidth: 400,
              wordBreak: "break-word",
              marginTop: 8,
            }}
          >
            {this.state.error?.message}
          </p>
          <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: "8px 20px",
                cursor: "pointer",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg-elevated)",
                color: "var(--text-primary)",
                font: "inherit",
              }}
            >
              Try again
            </button>
            <button
              onClick={this.handleQuit}
              style={{
                padding: "8px 20px",
                cursor: "pointer",
                borderRadius: 6,
                border: "1px solid var(--accent-red)",
                background: "transparent",
                color: "var(--accent-red)",
                font: "inherit",
              }}
            >
              Quit
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
