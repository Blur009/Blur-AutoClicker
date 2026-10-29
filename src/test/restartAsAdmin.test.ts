import { describe, it, expect, beforeEach, vi } from "vitest";
import { restartAsAdministrator } from "../restart";
import { tauri } from "./tauriHarness";

vi.mock(
  "@tauri-apps/api/core",
  async () => (await import("./tauriHarness")).coreModule,
);

vi.mock(
  "@tauri-apps/plugin-process",
  async () => (await import("./tauriHarness")).processModule,
);

beforeEach(() => {
  tauri.reset();
});

describe("restartAsAdministrator", () => {
  it("saves the pending settings before asking the backend to relaunch", async () => {
    const events: string[] = [];
    tauri.setInvokeHandler("relaunch_as_admin", () => {
      events.push("relaunch");
      return true;
    });
    const outcome = await restartAsAdministrator(async () => {
      events.push("flush");
      return true;
    });
    expect(outcome).toBe("relaunched");
    expect(events).toEqual(["flush", "relaunch"]);
  });

  it("exits after a successful relaunch", async () => {
    tauri.setInvokeResult("relaunch_as_admin", true);
    await expect(restartAsAdministrator(async () => true)).resolves.toBe(
      "relaunched",
    );
    expect(tauri.exits()).toEqual([0]);
    expect(tauri.firstIndexOf("invoke", "relaunch_as_admin")).toBeLessThan(
      tauri.firstIndexOf("exit", "exit"),
    );
  });

  it("keeps the app running when the relaunch is refused", async () => {
    tauri.setInvokeResult("relaunch_as_admin", false);
    await expect(restartAsAdministrator(async () => true)).resolves.toBe(
      "refused",
    );
    expect(tauri.exits()).toHaveLength(0);
  });

  it("does not relaunch when the settings could not be saved", async () => {
    await expect(restartAsAdministrator(async () => false)).resolves.toBe(
      "unsaved",
    );
    expect(tauri.invokes("relaunch_as_admin")).toHaveLength(0);
    expect(tauri.exits()).toHaveLength(0);
  });

  it("propagates a failing relaunch without exiting", async () => {
    tauri.setInvokeHandler("relaunch_as_admin", () => {
      throw new Error("no elevation");
    });
    await expect(restartAsAdministrator(async () => true)).rejects.toThrow(
      "no elevation",
    );
    expect(tauri.exits()).toHaveLength(0);
  });
});
