import { error as logError, warn as logWarn } from "@tauri-apps/plugin-log";

export function serializeDiagnosticValue(value: unknown) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? "",
    };
  }

  return {
    message: String(value),
  };
}

export function logDiagnostic(
  source: string,
  details: Record<string, unknown>,
) {
  logError(
    JSON.stringify({
      source,
      ...details,
    }),
  );
}

export function logWarning(source: string, details: Record<string, unknown>) {
  logWarn(
    JSON.stringify({
      source,
      ...details,
    }),
  );
}

export function installGlobalDiagnostics() {
  const handleError = (event: ErrorEvent) => {
    logDiagnostic("GlobalError", {
      error: serializeDiagnosticValue(event.error ?? event.message),
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    logDiagnostic("UnhandledRejection", {
      reason: serializeDiagnosticValue(event.reason),
    });
  };

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  return () => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  };
}
