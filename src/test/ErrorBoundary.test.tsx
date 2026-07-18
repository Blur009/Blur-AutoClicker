import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ErrorBoundary from "../components/ErrorBoundary";

function BrokenComponent({ message = "Kaboom" }: { message?: string }): never {
  throw new Error(message);
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div>All good</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("renders fallback UI when a child throws", () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Kaboom")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("resets and re-renders children after Try again is clicked", () => {
    let shouldThrow = true;
    function ConditionalThrower() {
      if (shouldThrow) throw new Error("Oops");
      return <div>Recovered</div>;
    }

    render(
      <ErrorBoundary>
        <ConditionalThrower />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByText("Try again"));

    expect(screen.getByText("Recovered")).toBeInTheDocument();
  });

  it("displays the error message in the fallback", () => {
    render(
      <ErrorBoundary>
        <BrokenComponent message="Disk full" />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Disk full")).toBeInTheDocument();
  });

  it("recovers and re-catches after reset", () => {
    let increment = 0;
    function CountingThrower(): never {
      increment++;
      throw new Error(`Crash #${increment}`);
    }

    render(
      <ErrorBoundary>
        <CountingThrower />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(increment).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByText("Try again"));

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(increment).toBeGreaterThanOrEqual(2);
  });
});
