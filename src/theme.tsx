import { createRoot } from "react-dom/client";
import { logDiagnostic, installGlobalDiagnostics } from "./diagnostics";
import { initAppVersion } from "./store";
import ErrorBoundary from "./components/ErrorBoundary";
import ThemeWindow from "./components/theme/ThemeWindow";
import "./index.css";
import "./themeWindow.css";

installGlobalDiagnostics();
void initAppVersion();

createRoot(document.getElementById("root")!, {
  onCaughtError: (error, errorInfo) => {
    logDiagnostic("theme.createRoot.onCaughtError", {
      error: error instanceof Error ? error.message : String(error),
      componentStack: errorInfo.componentStack,
      errorBoundary: errorInfo.errorBoundary?.constructor?.name,
    });
  },
}).render(
  <ErrorBoundary>
    <ThemeWindow />
  </ErrorBoundary>,
);
