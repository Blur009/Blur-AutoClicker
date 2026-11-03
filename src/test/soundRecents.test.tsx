import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  filterRecentSoundPaths,
  MAX_RECENT_SOUNDS,
  pushRecentSoundPath,
  sanitizeRecentSoundPaths,
  soundFileNameOf,
  soundFolderOf,
} from "../soundRecents";
import SoundRecentMenu from "../components/panels/settings/SoundRecentMenu";

describe("pushRecentSoundPath", () => {
  it("puts the newest first", () => {
    expect(pushRecentSoundPath(["a.wav"], "b.wav")).toEqual(["b.wav", "a.wav"]);
  });

  it("moves a repeat to the front instead of duplicating it", () => {
    expect(pushRecentSoundPath(["a.wav", "b.wav"], "A.WAV")).toEqual([
      "A.WAV",
      "b.wav",
    ]);
  });

  it("ignores blank paths and caps the list", () => {
    expect(pushRecentSoundPath(["a.wav"], "   ")).toEqual(["a.wav"]);
    const long = Array.from(
      { length: MAX_RECENT_SOUNDS },
      (_, i) => `${i}.wav`,
    );
    expect(pushRecentSoundPath(long, "new.wav")).toHaveLength(
      MAX_RECENT_SOUNDS,
    );
  });
});

describe("filterRecentSoundPaths", () => {
  const paths = ["C:/sounds/pop.wav", "C:/music/thud.mp3"];

  it("returns everything for an empty query", () => {
    expect(filterRecentSoundPaths(paths, "  ")).toEqual(paths);
  });

  it("matches anywhere in the path, case-insensitively", () => {
    expect(filterRecentSoundPaths(paths, "MUSIC")).toEqual([
      "C:/music/thud.mp3",
    ]);
    expect(filterRecentSoundPaths(paths, "pop")).toEqual(["C:/sounds/pop.wav"]);
  });
});

describe("path helpers", () => {
  it("splits backslash and forward slash paths", () => {
    expect(soundFileNameOf("C:\\sounds\\click.wav")).toBe("click.wav");
    expect(soundFolderOf("C:\\sounds\\click.wav")).toBe("C:\\sounds");
    expect(soundFolderOf("click.wav")).toBe("");
  });
});

describe("sanitizeRecentSoundPaths", () => {
  it("drops junk and duplicates", () => {
    expect(
      sanitizeRecentSoundPaths(["a.wav", " ", 42, "A.WAV", " b.wav ", null]),
    ).toEqual(["a.wav", "b.wav"]);
  });

  it("returns an empty list for non-arrays", () => {
    expect(sanitizeRecentSoundPaths(undefined)).toEqual([]);
    expect(sanitizeRecentSoundPaths("a.wav")).toEqual([]);
  });
});

describe("SoundRecentMenu", () => {
  const paths = [
    "C:/sounds/pop.wav",
    "C:/music/thud.mp3",
    "C:/music/clack.wav",
  ];

  it("renders its popover outside the card that owns it", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SoundRecentMenu
        paths={paths}
        label="Every click"
        onPick={() => {}}
        onRemove={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /recent every click sound files/i }),
    );

    const popover = screen.getByRole("dialog", { name: /recent sound files/i });
    expect(popover.parentElement).toBe(document.body);
    expect(container.contains(popover)).toBe(false);
  });

  it("lists recent files with their folder on a wrapped line", async () => {
    const user = userEvent.setup();
    render(
      <SoundRecentMenu
        paths={paths}
        label="Every click"
        onPick={() => {}}
        onRemove={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /recent every click sound files/i }),
    );

    expect(screen.getByText("pop.wav")).toBeInTheDocument();
    expect(screen.getByText("thud.mp3")).toBeInTheDocument();
    expect(screen.getByText("clack.wav")).toBeInTheDocument();
    expect(document.querySelectorAll(".sound-recent-path")).toHaveLength(3);
  });

  it("filters the list as you search", async () => {
    const user = userEvent.setup();
    render(
      <SoundRecentMenu
        paths={paths}
        label="Every click"
        onPick={() => {}}
        onRemove={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /recent every click sound files/i }),
    );
    await user.type(
      screen.getByRole("searchbox", { name: /search files in recent sounds/i }),
      "music",
    );

    expect(screen.getByText("thud.mp3")).toBeInTheDocument();
    expect(screen.queryByText("pop.wav")).not.toBeInTheDocument();
  });

  it("hands the picked path back and closes", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <SoundRecentMenu
        paths={paths}
        label="Every click"
        onPick={onPick}
        onRemove={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /recent every click sound files/i }),
    );
    await user.click(screen.getByText("thud.mp3"));

    expect(onPick).toHaveBeenCalledWith(paths[1]);
    expect(screen.queryByText("pop.wav")).not.toBeInTheDocument();
  });

  it("closes on Escape and hands focus back to the caret", async () => {
    const user = userEvent.setup();
    render(
      <SoundRecentMenu
        paths={paths}
        label="Every click"
        onPick={() => {}}
        onRemove={() => {}}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: /recent every click sound files/i,
    });
    await user.click(toggle);
    expect(screen.getByRole("searchbox")).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("dialog", { name: /recent sound files/i }),
    ).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it("closes when the pointer lands outside", async () => {
    const user = userEvent.setup();
    render(
      <SoundRecentMenu
        paths={paths}
        label="Every click"
        onPick={() => {}}
        onRemove={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /recent every click sound files/i }),
    );
    await user.click(document.body);

    expect(
      screen.queryByRole("dialog", { name: /recent sound files/i }),
    ).not.toBeInTheDocument();
  });

  it("places the open menu under the caret", async () => {
    const user = userEvent.setup();
    render(
      <SoundRecentMenu
        paths={paths}
        label="Every click"
        onPick={() => {}}
        onRemove={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /recent every click sound files/i }),
    );

    const popover = screen.getByRole("dialog", { name: /recent sound files/i });
    expect(popover).toHaveStyle({
      left: "8px",
      top: "4px",
      visibility: "visible",
    });
  });

  it("announces the result count while filtering", async () => {
    const user = userEvent.setup();
    render(
      <SoundRecentMenu
        paths={paths}
        label="Every click"
        onPick={() => {}}
        onRemove={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /recent every click sound files/i }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("3 of 3 files");

    await user.type(screen.getByRole("searchbox"), "zzz");

    expect(screen.getByRole("status")).toHaveTextContent(
      "No file matches that.",
    );
    expect(screen.queryByText("pop.wav")).not.toBeInTheDocument();
  });

  it("keeps focus inside the menu after forgetting a file", async () => {
    const user = userEvent.setup();
    render(
      <SoundRecentMenu
        paths={paths}
        label="Every click"
        onPick={() => {}}
        onRemove={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /recent every click sound files/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remove pop.wav from history" }),
    );

    expect(screen.getByRole("searchbox")).toHaveFocus();
  });

  it("forgets a file without selecting it", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onRemove = vi.fn();
    render(
      <SoundRecentMenu
        paths={paths}
        label="Every click"
        onPick={onPick}
        onRemove={onRemove}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /recent every click sound files/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remove pop.wav from history" }),
    );

    expect(onRemove).toHaveBeenCalledWith(paths[0]);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("says when nothing has been picked yet", async () => {
    const user = userEvent.setup();
    render(
      <SoundRecentMenu
        paths={[]}
        label="Every click"
        onPick={() => {}}
        onRemove={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /recent every click sound files/i }),
    );

    expect(screen.getByText("No sounds picked yet.")).toBeInTheDocument();
  });
});
