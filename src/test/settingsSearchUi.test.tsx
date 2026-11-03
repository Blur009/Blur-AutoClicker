import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SettingsSearchInput,
  SettingsSearchResults,
} from "../components/panels/settings/SettingsSearch";
import type { SettingsSearchResult } from "../settingsSearch";

function Harness({
  onSelect,
}: {
  onSelect: (result: SettingsSearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <>
      <SettingsSearchInput query={query} onQueryChange={setQuery} />
      {query.length > 0 && (
        <SettingsSearchResults query={query} onSelect={onSelect} />
      )}
    </>
  );
}

describe("settings search UI", () => {
  it("lists only the settings that match", async () => {
    const user = userEvent.setup();
    render(<Harness onSelect={() => {}} />);

    await user.type(screen.getByLabelText("Search settings"), "flash");

    expect(
      screen.getByRole("button", { name: /Flash On Click/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Always on Top/i }),
    ).not.toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    render(<Harness onSelect={() => {}} />);

    await user.type(
      screen.getByLabelText("Search settings"),
      "zzzznotasetting",
    );

    expect(screen.getByText(/No setting matches/i)).toBeInTheDocument();
  });

  it("reports which setting was picked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    await user.type(screen.getByLabelText("Search settings"), "opacity");
    await user.click(screen.getByRole("button", { name: /Panel Opacity/i }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].label).toBe("Panel Opacity");
    expect(onSelect.mock.calls[0][0].tab).toBe("appearance");
  });

  it("clears the query with Escape", async () => {
    const user = userEvent.setup();
    render(<Harness onSelect={() => {}} />);

    const input = screen.getByLabelText("Search settings");
    await user.type(input, "flash");
    expect(
      screen.getByRole("button", { name: /Flash On Click/i }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("button", { name: /Flash On Click/i }),
    ).not.toBeInTheDocument();
    expect(input).toHaveValue("");
  });
});
