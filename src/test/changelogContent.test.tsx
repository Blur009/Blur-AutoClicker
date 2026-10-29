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
});
