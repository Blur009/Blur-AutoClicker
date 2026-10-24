import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdvDropdown } from "../components/panels/advanced/sections/shared";
import { dropdownLeft } from "../components/panels/advanced/sections/dropdownPlacement";

const OPTIONS = [
  { value: "alpha", label: "Alpha" },
  { value: "beta", label: "Beta" },
  { value: "gamma", label: "Gamma" },
];

function renderedLabels() {
  return Array.from(document.querySelectorAll(".adv-dropdown-item")).map(
    (item) => item.textContent,
  );
}

async function openDropdown(searchable = true) {
  const onChange = vi.fn();
  render(
    <AdvDropdown
      value="alpha"
      options={OPTIONS}
      onChange={onChange}
      searchable={searchable}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Alpha" }));
  const input = screen.queryByPlaceholderText("Search");
  if (input) {
    await waitFor(() => expect(input).toHaveFocus());
  }
  return { user, input, onChange };
}

describe("AdvDropdown search", () => {
  it("filters labels case-insensitively and restores the full list when cleared", async () => {
    const { user, input } = await openDropdown();
    expect(renderedLabels()).toEqual(["Alpha", "Beta", "Gamma"]);

    await user.type(input!, "GAM");
    expect(renderedLabels()).toEqual(["Gamma"]);

    await user.clear(input!);
    expect(renderedLabels()).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("matches the option value as well as the label", async () => {
    const { user, input } = await openDropdown();
    await user.type(input!, "bet");
    expect(renderedLabels()).toEqual(["Beta"]);
  });

  it("selects the first match on Enter and closes the menu", async () => {
    const { user, input, onChange } = await openDropdown();
    await user.type(input!, "be");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("beta");
    expect(renderedLabels()).toEqual([]);
  });

  it("moves the active item with the arrow keys", async () => {
    const { user, input, onChange } = await openDropdown();
    await user.type(input!, "a");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");
    expect(
      document.querySelector(".adv-dropdown-item.active")?.textContent,
    ).toBe("Gamma");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("gamma");
  });

  it("closes on Escape without selecting", async () => {
    const { user, input, onChange } = await openDropdown();
    await user.type(input!, "be");
    await user.keyboard("{Escape}");
    expect(renderedLabels()).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stays open when the search input is clicked", async () => {
    const { user, input } = await openDropdown();
    await user.click(input!);
    expect(renderedLabels()).toEqual(["Alpha", "Beta", "Gamma"]);
  });
});

describe("AdvDropdown without search", () => {
  it("renders every option and no input", async () => {
    const { input } = await openDropdown(false);
    expect(input).toBeNull();
    expect(renderedLabels()).toEqual(["Alpha", "Beta", "Gamma"]);
  });
});

describe("dropdownLeft", () => {
  it("keeps the trigger's left edge when the menu fits", () => {
    expect(dropdownLeft(100, 300, 150, 1000)).toBe(100);
  });

  it("aligns the menu's right edge to the trigger when it would overflow", () => {
    expect(dropdownLeft(700, 950, 300, 1000)).toBe(650);
  });

  it("clamps to the window margin when the menu is wider than the window", () => {
    expect(dropdownLeft(5, 55, 400, 380)).toBe(8);
  });
});
