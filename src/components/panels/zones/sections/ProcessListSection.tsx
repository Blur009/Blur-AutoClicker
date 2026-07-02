import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "../../../../store";
import type {
  ProcessListBehavior,
  ProcessListEntry,
} from "../../../../settingsSchema";

import {
  Disableable,
  ToggleBtn,
  CardDivider,
  InfoIcon,
} from "../../advanced/sections/shared";

interface ProcessInfo {
  name: string;
  displayName: string;
  pid: number;
  iconBase64?: string;
}

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

export default function ProcessListSection({
  settings,
  update,
  showInfo,
}: Props) {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const silentRefresh = useCallback(async () => {
    try {
      const procs = await invoke<ProcessInfo[]>("list_processes");
      setProcesses(procs);
    } catch {
      //
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void (async () => {
      try {
        const procs = await invoke<ProcessInfo[]>("list_processes");
        if (mounted) setProcesses(procs);
      } catch {
        //
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    intervalRef.current = setInterval(silentRefresh, 5000);
    return () => {
      mounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [silentRefresh]);

  const toggleEntry = (name: string, checked: boolean) => {
    const next = checked
      ? [
          ...settings.processListEntries,
          {
            name,
            behavior: "stop" as ProcessListBehavior,
            enabled: true,
          } as ProcessListEntry,
        ]
      : settings.processListEntries.filter((e) => e.name !== name);
    update({ processListEntries: next });
  };

  const toggleEntryBehavior = (name: string, behavior: ProcessListBehavior) => {
    const next = settings.processListEntries.map((e) =>
      e.name === name ? { ...e, behavior } : e,
    );
    update({ processListEntries: next });
  };

  const entryMap = new Map(settings.processListEntries.map((e) => [e.name, e]));
  const matchesSearch = (p: ProcessInfo) =>
    searchQuery.length < 1 ||
    p.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.name.toLowerCase().includes(searchQuery.toLowerCase());

  const checkedProcesses = processes.filter(
    (p) => entryMap.get(p.name)?.enabled && matchesSearch(p),
  );
  const uncheckedProcesses = processes.filter(
    (p) => !entryMap.has(p.name) && matchesSearch(p),
  );

  return (
    <div className="adv-sectioncontainer adv-process-list-section">
      <div className="adv-card-header">
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {showInfo ? (
            <InfoIcon text="Pause clicking when certain applications are focused. Checked processes are whitelisted or blacklisted depending on the mode selected." />
          ) : null}
          <span className="adv-card-title">Process List</span>
        </div>
        <ToggleBtn
          value={settings.processListEnabled}
          onChange={(v) => update({ processListEnabled: v })}
        />
      </div>
      <CardDivider />
      <Disableable
        enabled={settings.processListEnabled}
        disabledReason="Enable Process List to manage application rules."
      >
        <div className="adv-row" style={{ marginBottom: "0.5rem" }}>
          <div className="adv-seg-group">
            <button
              type="button"
              className={`adv-seg-btn ${settings.processListMode === "whitelist" ? "active" : ""}`}
              onClick={() => update({ processListMode: "whitelist" })}
            >
              Whitelist
            </button>
            <button
              type="button"
              className={`adv-seg-btn ${settings.processListMode === "blacklist" ? "active" : ""}`}
              onClick={() => update({ processListMode: "blacklist" })}
            >
              Blacklist
            </button>
          </div>
          <input
            type="text"
            className="adv-proc-search"
            placeholder={`search in ${processes.length} applications`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {settings.processListMode === "whitelist" &&
        settings.processListEntries.length === 0 ? (
          <div className="adv-whitelist-warning">
            Whitelist mode is active with no applications selected. Clicking
            will be blocked everywhere.
          </div>
        ) : null}
        <div className="adv-process-list">
          {loading ? (
            <div className="adv-sequence-empty">Refreshing...</div>
          ) : processes.length === 0 ? (
            <div className="adv-sequence-empty">
              No processes found. Click Refresh.
            </div>
          ) : searchQuery.length >= 1 &&
            checkedProcesses.length === 0 &&
            uncheckedProcesses.length === 0 ? (
            <div
              className="adv-sequence-empty"
              style={{ textAlign: "center", padding: "1rem" }}
            >
              no process named "{searchQuery}"
            </div>
          ) : (
            <>
              {checkedProcesses.map((proc) => (
                <ProcessRow
                  key={proc.name}
                  proc={proc}
                  entry={entryMap.get(proc.name)!}
                  onToggleEntry={toggleEntry}
                  onToggleBehavior={toggleEntryBehavior}
                />
              ))}
              {checkedProcesses.length > 0 && uncheckedProcesses.length > 0 && (
                <div
                  style={{
                    height: 1,
                    background: "var(--border-subtle)",
                    margin: "0.25rem 0",
                  }}
                />
              )}
              {uncheckedProcesses.map((proc) => (
                <ProcessRow
                  key={proc.name}
                  proc={proc}
                  entry={undefined}
                  onToggleEntry={toggleEntry}
                  onToggleBehavior={toggleEntryBehavior}
                />
              ))}
            </>
          )}
        </div>
      </Disableable>
    </div>
  );
}

function ProcessRow({
  proc,
  entry,
  onToggleEntry,
  onToggleBehavior,
}: {
  proc: ProcessInfo;
  entry: ProcessListEntry | undefined;
  onToggleEntry: (name: string, checked: boolean) => void;
  onToggleBehavior: (name: string, behavior: ProcessListBehavior) => void;
}) {
  const isChecked = entry?.enabled ?? false;
  return (
    <label className="adv-sequence-item">
      <input
        type="checkbox"
        className="adv-proc-checkbox"
        checked={isChecked}
        onChange={(e) => onToggleEntry(proc.name, e.target.checked)}
      />
      {proc.iconBase64 ? (
        <img src={proc.iconBase64} alt="" className="adv-proc-icon" />
      ) : null}
      <span className="adv-proc-name">{proc.displayName}</span>
      <span className="adv-proc-exe">{proc.name}</span>
      <div
        className={`adv-proc-behavior-toggle ${isChecked ? "" : "disabled"}`}
      >
        <button
          type="button"
          className={`adv-toggle-btn adv-toggle-off ${entry?.behavior === "stop" ? "active" : ""}`}
          disabled={!isChecked}
          onClick={() => isChecked && onToggleBehavior(proc.name, "stop")}
        >
          Stop
        </button>
        <button
          type="button"
          className={`adv-toggle-btn adv-toggle-on ${entry?.behavior === "pause" ? "active" : ""}`}
          disabled={!isChecked}
          onClick={() => isChecked && onToggleBehavior(proc.name, "pause")}
        >
          Pause
        </button>
      </div>
    </label>
  );
}
