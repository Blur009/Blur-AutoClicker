import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "../../../../store";
import type { ProcessListEntry } from "../../../../settingsSchema";
import { Disableable, CardDivider } from "../../advanced/sections/shared";
import { SettingsCard } from "./shared";

interface ProcessInfo {
  name: string;
  displayName: string;
  pid: number;
  iconBase64?: string;
}

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export default function ProcessListSection({ settings, update }: Props) {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [listAtBottom, setListAtBottom] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const updateListAtBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setListAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
  }, []);

  const handleListScroll = useCallback(() => {
    updateListAtBottom();
  }, [updateListAtBottom]);

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

  useEffect(() => {
    updateListAtBottom();
  }, [processes, searchQuery, updateListAtBottom]);

  const toggleEntry = (name: string, checked: boolean) => {
    const next = checked
      ? [
          ...settings.processListEntries,
          {
            name,
            enabled: true,
          } as ProcessListEntry,
        ]
      : settings.processListEntries.filter((e) => e.name !== name);
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
    <SettingsCard
      title="Process List"
      description="Stop clicking when specific applications are in focus."
    >
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Enable</span>
          <span className="settings-sublabel">
            Stop clicking based on the active application.
          </span>
        </div>
        <div className="settings-seg-group">
          {[
            { value: false, label: "Off" },
            { value: true, label: "On" },
          ].map((option) => (
            <button
              key={String(option.value)}
              className={`settings-seg-btn ${settings.processListEnabled === option.value ? "active" : ""}`}
              onClick={() => update({ processListEnabled: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Mode</span>
          <span className="settings-sublabel">
            Whitelist only allows checked apps. Blacklist blocks them.
          </span>
        </div>
        <div className="settings-seg-group">
          <button
            type="button"
            className={`settings-seg-btn ${settings.processListMode === "whitelist" ? "active" : ""}`}
            onClick={() => update({ processListMode: "whitelist" })}
          >
            Whitelist
          </button>
          <button
            type="button"
            className={`settings-seg-btn ${settings.processListMode === "blacklist" ? "active" : ""}`}
            onClick={() => update({ processListMode: "blacklist" })}
          >
            Blacklist
          </button>
        </div>
      </div>

      <CardDivider />

      <Disableable
        enabled={settings.processListEnabled}
        disabledReason="Enable Process List to manage application rules."
      >
        {settings.processListMode === "whitelist" &&
        settings.processListEntries.length === 0 ? (
          <div className="settings-whitelist-warning">
            Whitelist mode is active with no applications selected. Clicking
            will be blocked everywhere.
          </div>
        ) : null}

        <div className="settings-proc-search-row">
          <input
            type="text"
            className="settings-proc-search"
            placeholder={`search in ${processes.length} applications`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div
          style={{
            position: "relative",
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            className="settings-proc-list"
            ref={listRef}
            onScroll={handleListScroll}
          >
            {loading ? (
              <div className="adv-click-points-empty">Refreshing...</div>
            ) : processes.length === 0 ? (
              <div className="adv-click-points-empty">
                No processes found. Click Refresh.
              </div>
            ) : searchQuery.length >= 1 &&
              checkedProcesses.length === 0 &&
              uncheckedProcesses.length === 0 ? (
              <div
                className="adv-click-points-empty"
                style={{ textAlign: "center", padding: "1rem" }}
              >
                no process named &quot;{searchQuery}&quot;
              </div>
            ) : (
              <>
                {checkedProcesses.map((proc) => (
                  <ProcessRow
                    key={proc.name}
                    proc={proc}
                    entry={entryMap.get(proc.name)!}
                    onToggleEntry={toggleEntry}
                  />
                ))}
                {checkedProcesses.length > 0 &&
                  uncheckedProcesses.length > 0 && (
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
                  />
                ))}
              </>
            )}
          </div>
          <div
            className={`settings-proc-fade ${listAtBottom ? "settings-proc-fade--hidden" : ""}`}
          />
        </div>
      </Disableable>
    </SettingsCard>
  );
}

function ProcessRow({
  proc,
  entry,
  onToggleEntry,
}: {
  proc: ProcessInfo;
  entry: ProcessListEntry | undefined;
  onToggleEntry: (name: string, checked: boolean) => void;
}) {
  const isChecked = entry?.enabled ?? false;
  return (
    <label className="adv-click-points-item">
      <input
        type="checkbox"
        className="settings-proc-checkbox"
        checked={isChecked}
        onChange={(e) => onToggleEntry(proc.name, e.target.checked)}
      />
      {proc.iconBase64 ? (
        <img src={proc.iconBase64} alt="" className="settings-proc-icon" />
      ) : null}
      <span className="settings-proc-name">{proc.displayName}</span>
      <span className="settings-proc-exe">{proc.name}</span>
    </label>
  );
}
