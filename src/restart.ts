import { invoke } from "@tauri-apps/api/core";
import { exit } from "@tauri-apps/plugin-process";

export type RestartOutcome = "relaunched" | "refused" | "unsaved";

export async function restartAsAdministrator(
  flushSettings: () => Promise<boolean>,
  keepAutostart: boolean,
): Promise<RestartOutcome> {
  const saved = await flushSettings();
  if (!saved) {
    return "unsaved";
  }
  const relaunched = await invoke<boolean>("relaunch_as_admin", {
    keepAutostart,
  });
  if (!relaunched) {
    return "refused";
  }
  await exit(0);
  return "relaunched";
}

export async function restartWithoutAdministrator(
  flushSettings: () => Promise<boolean>,
  keepAutostart: boolean,
): Promise<RestartOutcome> {
  const saved = await flushSettings();
  if (!saved) {
    return "unsaved";
  }
  const relaunched = await invoke<boolean>("relaunch_without_admin", {
    keepAutostart,
  });
  if (!relaunched) {
    return "refused";
  }
  await exit(0);
  return "relaunched";
}
