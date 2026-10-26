import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import ThemeWindow from "../components/theme/ThemeWindow";
import type {
  ThemeApplyMessage,
  ThemeStateMessage,
  ThemeUpsertMessage,
} from "../themeBridge";
import { THEME_PALETTES, createThemeProfile } from "../themeModel";
import { THEME_PRESETS, THEME_PRESET_CATEGORIES } from "../themePresets";
import { tauri } from "./tauriHarness";

vi.mock(
  "@tauri-apps/api/window",
  async () => (await import("./tauriHarness")).windowModule,
);

vi.mock("../store", async () => (await import("./tauriHarness")).storeModule);

vi.mock(
  "@tauri-apps/api/core",
  async () => (await import("./tauriHarness")).coreModule,
);

vi.mock("../diagnostics", () => ({
  logDiagnostic: vi.fn(),
}));

const bridgeMock = vi.hoisted(() => ({
  emits: [] as ThemeApplyMessage[],
  stateHandler: null as ((message: ThemeStateMessage) => void) | null,
  emitGate: null as Promise<void> | null,
}));

vi.mock("../themeBridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../themeBridge")>();
  return {
    ...actual,
    onThemeState: (handler: (message: ThemeStateMessage) => void) => {
      bridgeMock.stateHandler = handler;
      return Promise.resolve(() => {});
    },
    emitThemeApply: async (message: ThemeApplyMessage) => {
      bridgeMock.emits.push(message);
      if (bridgeMock.emitGate) await bridgeMock.emitGate;
    },
  };
});

function upserts(): ThemeUpsertMessage[] {
  return bridgeMock.emits.filter(
    (message): message is ThemeUpsertMessage => message.kind === "upsert",
  );
}

function deletes(): ThemeApplyMessage[] {
  return bridgeMock.emits.filter((message) => message.kind === "delete");
}

async function createFirstProfile(template: "dark" | "light" = "dark") {
  fireEvent.click(
    await screen.findByRole("button", { name: "Create custom theme" }),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: `Create theme from the ${template} template`,
    }),
  );
  await waitFor(() => expect(upserts()).toHaveLength(1));
}

function openProfileMenu(name: string) {
  const item = screen.getByRole("button", { name: `Edit profile ${name}` });
  fireEvent.contextMenu(item, { clientX: 120, clientY: 160 });
  return item;
}

beforeEach(() => {
  tauri.reset();
  tauri.setStoredSettings({ accentColor: "#123456" });
  bridgeMock.emits.length = 0;
  bridgeMock.stateHandler = null;
  bridgeMock.emitGate = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ThemeWindow", () => {
  it("renders the empty state with a create button", async () => {
    render(<ThemeWindow />);

    expect(await screen.findByText(/No custom themes yet/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create custom theme" }),
    ).toBeInTheDocument();
  });

  it("creates a dark profile seeded from the dark palette and current accent", async () => {
    render(<ThemeWindow />);
    await createFirstProfile("dark");

    const [message] = upserts();
    expect(message.activateCustom).toBe(true);
    expect(message.profile.base).toBe("dark");
    expect(message.profile.tokens.bgBase).toEqual(THEME_PALETTES.dark.bgBase);
    expect(message.profile.tokens.accent.hex).toBe("#123456");
    expect(screen.getByText("Based on the dark palette")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Window color" }));
    expect(
      screen.getByRole("dialog", { name: "Window color" }),
    ).toBeInTheDocument();
  });

  it("shows the unsaved error when an upsert is not acknowledged", async () => {
    vi.useFakeTimers();
    render(<ThemeWindow />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Create custom theme" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Create theme from the dark template",
      }),
    );
    const [message] = upserts();
    expect(message).toBeDefined();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Changes are not confirmed yet.",
    );

    act(() => {
      bridgeMock.stateHandler!({
        sessionId: message.sessionId,
        ackSeq: message.seq,
        theme: "custom",
        activeProfileId: message.profile.id,
        profiles: [
          {
            id: message.profile.id,
            name: message.profile.name,
            base: message.profile.base,
            updatedAt: message.profile.updatedAt,
          },
        ],
        activeProfile: message.profile,
      });
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("flushes a pending debounced edit before emitting a duplicate", async () => {
    render(<ThemeWindow />);
    await createFirstProfile("dark");

    const source = upserts()[0].profile;
    bridgeMock.emits.length = 0;
    vi.useFakeTimers();

    fireEvent.change(screen.getByLabelText("Window hex value"), {
      target: { value: "#112233" },
    });
    openProfileMenu(source.name);
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));

    await act(async () => {
      await Promise.resolve();
    });

    const emitted = upserts().map((message) => message.profile);
    expect(emitted).toHaveLength(2);
    expect(emitted[0].id).toBe(source.id);
    expect(emitted[0].tokens.bgBase.hex).toBe("#112233");
    expect(emitted[1].id).not.toBe(source.id);
    expect(emitted[1].name).toBe(`${source.name} copy`);
  });

  it("flushes a pending edit before closing the window", async () => {
    render(<ThemeWindow />);
    await createFirstProfile("dark");
    await waitFor(() =>
      expect(tauri.windowCalls("onCloseRequested")).toHaveLength(1),
    );
    bridgeMock.emits.length = 0;

    fireEvent.change(screen.getByLabelText("Window hex value"), {
      target: { value: "#112233" },
    });

    let releaseEmit = () => {};
    bridgeMock.emitGate = new Promise<void>((resolve) => {
      releaseEmit = resolve;
    });
    expect(tauri.requestClose()).toBe(true);

    await act(async () => {
      await Promise.resolve();
    });

    expect(upserts()).toHaveLength(1);
    expect(upserts()[0].profile.tokens.bgBase.hex).toBe("#112233");
    expect(tauri.invokes("close_theme_window")).toHaveLength(0);

    bridgeMock.emitGate = null;
    await act(async () => {
      releaseEmit();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(tauri.invokes("close_theme_window")).toHaveLength(1),
    );
  });

  it("opens the profile menu from right-click and from the keyboard", async () => {
    render(<ThemeWindow />);
    await createFirstProfile("dark");
    const name = upserts()[0].profile.name;

    const item = openProfileMenu(name);
    expect(item).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu", { name: "Profile actions" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(item).toHaveAttribute("aria-expanded", "false");

    item.focus();
    fireEvent.keyDown(item, { key: "F10", shiftKey: true });
    expect(screen.getByRole("menu", { name: "Profile actions" })).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.keyDown(item, { key: "ContextMenu" });
    expect(screen.getByRole("menu", { name: "Profile actions" })).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
  });

  it("duplicates the right-clicked profile rather than the active one", async () => {
    render(<ThemeWindow />);
    await createFirstProfile("dark");
    const firstName = upserts()[0].profile.name;

    fireEvent.click(screen.getByRole("button", { name: "New profile" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Create theme from the light template",
      }),
    );
    await waitFor(() => expect(upserts()).toHaveLength(2));
    expect(screen.getByLabelText("Profile name")).toHaveValue(
      upserts()[1].profile.name,
    );

    bridgeMock.emits.length = 0;
    openProfileMenu(firstName);
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));

    await waitFor(() => expect(upserts()).toHaveLength(1));
    expect(upserts()[0].profile.name).toBe(`${firstName} copy`);
    expect(screen.getByLabelText("Profile name")).toHaveValue(
      `${firstName} copy`,
    );
    expect(
      screen.getByRole("button", { name: `Edit profile ${firstName} copy` }),
    ).toHaveFocus();
  });

  it("gives repeated duplicates unique names", async () => {
    render(<ThemeWindow />);
    await createFirstProfile("dark");
    const sourceName = upserts()[0].profile.name;

    openProfileMenu(sourceName);
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() => expect(upserts()).toHaveLength(2));
    expect(upserts()[1].profile.name).toBe(`${sourceName} copy`);

    openProfileMenu(sourceName);
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() => expect(upserts()).toHaveLength(3));
    expect(upserts()[2].profile.name).toBe(`${sourceName} copy 2`);
  });

  it("deletes a profile only after the confirm step", async () => {
    render(<ThemeWindow />);
    await createFirstProfile("dark");
    const name = upserts()[0].profile.name;

    openProfileMenu(name);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(
      screen.getByRole("menuitem", { name: "Confirm delete" }),
    ).toBeVisible();
    expect(deletes()).toHaveLength(0);

    fireEvent.click(screen.getByRole("menuitem", { name: "Confirm delete" }));
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(
      screen.queryByRole("button", { name: `Edit profile ${name}` }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText(/No custom themes yet/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create custom theme" }),
    ).toHaveFocus();
  });

  it("selects a profile from the rail on click", async () => {
    render(<ThemeWindow />);
    await createFirstProfile("dark");
    const firstName = upserts()[0].profile.name;

    fireEvent.click(screen.getByRole("button", { name: "New profile" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Create theme from the light template",
      }),
    );
    await waitFor(() => expect(upserts()).toHaveLength(2));

    fireEvent.click(
      screen.getByRole("button", { name: `Edit profile ${firstName}` }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Profile name")).toHaveValue(firstName),
    );
  });

  it("suppresses the native context menu outside text fields", async () => {
    render(<ThemeWindow />);
    await createFirstProfile("dark");

    expect(fireEvent.contextMenu(document.body)).toBe(false);
    expect(fireEvent.contextMenu(screen.getByLabelText("Profile name"))).toBe(
      true,
    );
    expect(
      fireEvent.contextMenu(screen.getByLabelText("Window hex value")),
    ).toBe(true);
  });

  it("lists the built-in templates and a preset from every category", async () => {
    render(<ThemeWindow />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Create custom theme" }),
    );

    expect(
      screen.getByRole("button", {
        name: "Create theme from the dark template",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Create theme from the light template",
      }),
    ).toBeInTheDocument();

    for (const category of THEME_PRESET_CATEGORIES) {
      expect(
        screen.getByRole("heading", { name: category.label }),
      ).toBeInTheDocument();
      const presets = THEME_PRESETS.filter(
        (preset) => preset.category === category.id,
      );
      expect(presets.length).toBeGreaterThan(0);
      for (const preset of presets) {
        expect(
          screen.getByRole("button", {
            name: `Create theme from ${preset.name}`,
          }),
        ).toBeInTheDocument();
      }
    }

    expect(
      screen.getByRole("searchbox", { name: "Search templates" }),
    ).toHaveFocus();
  });

  it("filters the template list by name and category", async () => {
    render(<ThemeWindow />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Create custom theme" }),
    );
    const search = screen.getByRole("searchbox", {
      name: "Search templates",
    });

    fireEvent.change(search, { target: { value: "NORD" } });
    expect(
      screen.getByRole("button", { name: "Create theme from Nord Dark" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create theme from Nord Light" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create theme from macOS Dark" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Create theme from the dark template",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Apps" }),
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "apps" } });
    expect(
      screen.getByRole("button", { name: "Create theme from GitHub Dark" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Apps" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create theme from Nord Dark" }),
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "nothing here" } });
    expect(screen.getByRole("status")).toHaveTextContent(
      "No templates match that search.",
    );
    expect(
      screen.getByText("No templates match that search."),
    ).toBeInTheDocument();
  });

  it("matches search terms without diacritics", async () => {
    render(<ThemeWindow />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Create custom theme" }),
    );
    const search = screen.getByRole("searchbox", {
      name: "Search templates",
    });

    fireEvent.change(search, { target: { value: "frappe" } });

    expect(
      screen.getByRole("button", {
        name: "Create theme from Catppuccin Frappé",
      }),
    ).toBeInTheDocument();
  });

  it("closes the template chooser on Escape and restores focus", async () => {
    render(<ThemeWindow />);
    const create = await screen.findByRole("button", {
      name: "Create custom theme",
    });
    create.focus();
    fireEvent.click(create);
    expect(
      screen.getByRole("dialog", { name: "Start from a template" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".theme-titlebar")).toHaveAttribute("inert");
    expect(document.querySelector(".theme-body")).toHaveAttribute("inert");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector(".theme-titlebar")).not.toHaveAttribute(
      "inert",
    );
    expect(document.querySelector(".theme-body")).not.toHaveAttribute("inert");
    expect(create).toHaveFocus();
  });

  it("closes the template chooser on a backdrop click", async () => {
    render(<ThemeWindow />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Create custom theme" }),
    );
    const backdrop = document.querySelector(".theme-chooser-backdrop")!;
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the chooser open when the pointer gesture starts inside it", async () => {
    render(<ThemeWindow />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Create custom theme" }),
    );
    fireEvent.pointerDown(
      screen.getByRole("dialog", { name: "Start from a template" }),
    );
    fireEvent.click(document.querySelector(".theme-chooser-backdrop")!);
    expect(
      screen.getByRole("dialog", { name: "Start from a template" }),
    ).toBeInTheDocument();
  });

  it("keeps focus on a field reset button after clicking it", async () => {
    render(<ThemeWindow />);
    await createFirstProfile("dark");
    const reset = screen.getByRole("button", {
      name: "Reset Accent color",
    });
    reset.focus();
    fireEvent.click(reset);
    await waitFor(() => expect(reset).toHaveAttribute("aria-disabled", "true"));
    expect(reset).toHaveFocus();
  });

  it("creates a profile named after the picked preset", async () => {
    render(<ThemeWindow />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Create custom theme" }),
    );
    const preset = THEME_PRESETS.find(
      (entry) => entry.id === "catppuccin-mocha",
    )!;
    fireEvent.click(
      screen.getByRole("button", {
        name: `Create theme from ${preset.name}`,
      }),
    );

    await waitFor(() => expect(upserts()).toHaveLength(1));
    const [message] = upserts();
    expect(message.activateCustom).toBe(true);
    expect(message.profile.name).toBe(preset.name);
    expect(message.profile.base).toBe(preset.base);
    expect(message.profile.tokens).toEqual(preset.tokens);
    expect(
      screen.queryByRole("dialog", { name: "Start from a template" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Profile name")).toHaveValue(preset.name);
    expect(screen.getByLabelText("Profile name")).toHaveFocus();
    expect(
      screen.getByText(`Based on the ${preset.base} palette`),
    ).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe(preset.base);
  });

  it("gives preset profiles unique names", async () => {
    render(<ThemeWindow />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Create custom theme" }),
    );
    const preset = THEME_PRESETS.find(
      (entry) => entry.id === "catppuccin-mocha",
    )!;
    fireEvent.click(
      screen.getByRole("button", {
        name: `Create theme from ${preset.name}`,
      }),
    );
    await waitFor(() => expect(upserts()).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "New profile" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: `Create theme from ${preset.name}`,
      }),
    );
    await waitFor(() => expect(upserts()).toHaveLength(2));

    expect(upserts()[1].profile.name).toBe(`${preset.name} 2`);
  });

  it("adopts a theme-state profile into the rail and active editor", async () => {
    render(<ThemeWindow />);
    await screen.findByText(/No custom themes yet/);
    await waitFor(() => expect(bridgeMock.stateHandler).not.toBeNull());

    const profile = createThemeProfile(
      "dark",
      "#ff0000",
      "Incoming",
      "theme-incoming",
      2,
    );

    act(() => {
      bridgeMock.stateHandler!({
        sessionId: "session-1",
        ackSeq: 0,
        theme: "custom",
        activeProfileId: profile.id,
        profiles: [
          {
            id: profile.id,
            name: profile.name,
            base: profile.base,
            updatedAt: profile.updatedAt,
          },
        ],
        activeProfile: profile,
      });
    });

    expect(
      screen.getByRole("button", { name: "Edit profile Incoming" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Profile name")).toHaveValue("Incoming");
    expect(screen.getByText("Based on the dark palette")).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
