import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  installGlobalDiagnostics,
  logDiagnostic,
  serializeDiagnosticValue,
} from "../diagnostics";

const errorModule = await import("@tauri-apps/plugin-log");
const mockError = vi.mocked(errorModule.error);

describe("Global error handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("logs unhandled promise rejections via @tauri-apps/plugin-log", () => {
    const reason = new Error("Network failure");
    const promise = new Promise(() => {});
    const event = new PromiseRejectionEvent("unhandledrejection", {
      promise,
      reason,
    });

    const cleanup = installGlobalDiagnostics();
    window.dispatchEvent(event);
    cleanup();

    expect(mockError).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(mockError.mock.calls[0][0]);
    expect(parsed.source).toBe("UnhandledRejection");
    expect(parsed.reason.message).toBe("Network failure");
    expect(parsed.reason.stack).toContain("Network failure");
  });

  it("logs global error events via @tauri-apps/plugin-log", () => {
    const testError = new Error("Render crashed");
    const event = new ErrorEvent("error", {
      error: testError,
      message: "Render crashed",
    });

    const cleanup = installGlobalDiagnostics();
    window.dispatchEvent(event);
    cleanup();

    expect(mockError).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(mockError.mock.calls[0][0]);
    expect(parsed.source).toBe("GlobalError");
    expect(parsed.error.message).toBe("Render crashed");
    expect(parsed.error.stack).toContain("Render crashed");
  });

  it("logs global error events with string message when no error object", () => {
    const event = new ErrorEvent("error", {
      error: null,
      message: "Script error",
    });

    const cleanup = installGlobalDiagnostics();
    window.dispatchEvent(event);
    cleanup();

    const parsed = JSON.parse(mockError.mock.calls[0][0]);
    expect(parsed.error.message).toBe("Script error");
  });

  it("createRoot onCaughtError logs structured payload", () => {
    const errorInfo = {
      componentStack: "at ErrorButton",
      errorBoundary: { constructor: { name: "ErrorBoundary" } },
    };
    const err = new Error("Caught by boundary");

    logDiagnostic("createRoot.onCaughtError", {
      error: serializeDiagnosticValue(err),
      componentStack: errorInfo.componentStack,
      errorBoundary: errorInfo.errorBoundary?.constructor?.name,
    });

    expect(mockError).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(mockError.mock.calls[0][0]);
    expect(parsed.source).toBe("createRoot.onCaughtError");
    expect(parsed.error.message).toBe("Caught by boundary");
    expect(parsed.componentStack).toContain("ErrorButton");
    expect(parsed.errorBoundary).toBe("ErrorBoundary");
  });
});
