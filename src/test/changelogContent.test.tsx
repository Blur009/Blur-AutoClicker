import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChangelogContent from "../components/ChangelogContent";
import type { ChangelogEntry } from "../changelog";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => {}),
}));

const entries: ChangelogEntry[] = [
  {
    version: "3.0.0",
    date: "01.01.2026",
    sections: [
      {
        heading: "New",
        items: [
          {
            text: "Newest change",
            subitems: ["Nested detail"],
          },
        ],
      },
    ],
  },
  {
    version: "2.0.0",
    date: "01.01.2025",
    sections: [
      { heading: "New", items: [{ text: "Middle change", subitems: [] }] },
    ],
  },
  {
    version: "1.0.0",
    date: "01.01.2024",
    sections: [
      { heading: "New", items: [{ text: "Oldest change", subitems: [] }] },
    ],
  },
];

function endClipTransition(container: HTMLElement) {
  const clip = container.querySelector(".changelog-clip");
  if (!(clip instanceof HTMLElement)) throw new Error("clip not found");
  const event = new Event("transitionend", { bubbles: true });
  Object.defineProperty(event, "propertyName", { value: "max-height" });
  act(() => {
    clip.dispatchEvent(event);
  });
}

describe("ChangelogContent", () => {
  it("shows one version until asked, then collapses back", async () => {
    const user = userEvent.setup();
    const { container } = render(<ChangelogContent entries={entries} />);

    expect(screen.getByText("Newest change")).toBeInTheDocument();
    expect(screen.getByText("Nested detail")).toBeInTheDocument();
    expect(screen.queryByText("Middle change")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /2 more versions/ }));

    expect(screen.getByText("Middle change")).toBeInTheDocument();
    expect(screen.getByText("Oldest change")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show less" }));
    endClipTransition(container);

    expect(screen.queryByText("Middle change")).not.toBeInTheDocument();
    expect(screen.queryByText("Oldest change")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /2 more versions/ }),
    ).toBeInTheDocument();
  });
  it("keeps the release date in a popover on the version", async () => {
    const user = userEvent.setup();
    render(
      <ChangelogContent
        entries={[{ ...entries[0], date: "01.01.2026 (d.m.y)" }]}
      />,
    );

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.hover(screen.getByText("v3.0.0"));

    const tip = screen.getByRole("tooltip");
    // Portaled to the body so the collapsed clip animation cannot cut it off.
    expect(tip.parentElement).toBe(document.body);
    expect(tip.closest(".changelog-clip")).toBeNull();
    expect(tip).toHaveTextContent("01.01.2026");
    expect(tip).toHaveTextContent("(d.m.y)");
    expect(tip).toHaveTextContent(/today|day ago|days ago/);

    await user.unhover(screen.getByText("v3.0.0"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens the date popover from the keyboard too", async () => {
    const user = userEvent.setup();
    render(<ChangelogContent entries={entries} />);

    await user.tab();
    expect(screen.getByRole("tooltip")).toHaveTextContent("01.01.2026");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
