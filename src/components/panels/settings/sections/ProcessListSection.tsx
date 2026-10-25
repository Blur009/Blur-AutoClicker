import {
  type CSSProperties,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

const PROC_LIST_WRAPPER_STYLE: CSSProperties = {
  position: "relative",
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
};

const PROC_DIVIDER_STYLE: CSSProperties = {
  height: 1,
  background: "var(--border-subtle)",
  margin: "0.25rem 0",
};

const PROC_EMPTY_SEARCH_STYLE: CSSProperties = {
  textAlign: "center",
  padding: "1rem",
};

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
    if (document.hidden) return;
    try {
      const procs = await invoke<ProcessInfo[]>("list_processes");
      setProcesses(procs);
    } catch {
      //
    }
  }, []);

  useEffect(() => {
    let mounted = true;
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
    const handleVisibilityChange = () => {
      if (!document.hidden) void silentRefresh();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      mounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [silentRefresh]);

  useEffect(() => {
    updateListAtBottom();
  }, [processes, searchQuery, updateListAtBottom]);

  const toggleEntry = useCallback(
    (name: string, checked: boolean) => {
      const withoutName = settings.processListEntries.filter(
        (e) => e.name !== name,
      );
      const next = checked
        ? [
            ...withoutName,
            {
              name,
              enabled: true,
            } as ProcessListEntry,
          ]
        : withoutName;
      update({ processListEntries: next });
    },
    [settings.processListEntries, update],
  );

  const entryMap = useMemo(
    () => new Map(settings.processListEntries.map((e) => [e.name, e])),
    [settings.processListEntries],
  );
  const loweredQuery = searchQuery.toLowerCase();
  const { checkedProcesses, uncheckedProcesses } = useMemo(() => {
    const checked: ProcessInfo[] = [];
    const unchecked: ProcessInfo[] = [];
    for (const p of processes) {
      if (
        loweredQuery.length >= 1 &&
        !p.displayName.toLowerCase().includes(loweredQuery) &&
        !p.name.toLowerCase().includes(loweredQuery)
      ) {
        continue;
      }
      if (entryMap.get(p.name)?.enabled) checked.push(p);
      else unchecked.push(p);
    }
    return { checkedProcesses: checked, uncheckedProcesses: unchecked };
  }, [processes, entryMap, loweredQuery]);

  return (
    <SettingsCard
      title="Process List"
      description="Stop clicking when specific applications are in focus."
    >
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Enable</span>
          <span className="settings-sublabel">
            Turn the per-app stop rules on or off.
          </span>
        </div>
        <div className="settings-toggle-wrapper">
          <button
            className={`settings-toggle ${settings.processListEnabled ? "on" : "off"}`}
            onClick={() =>
              update({ processListEnabled: !settings.processListEnabled })
            }
          >
            <span className="settings-toggle-knob" />
          </button>
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
            placeholder={`Search ${processes.length} applications`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={PROC_LIST_WRAPPER_STYLE}>
          <div
            className="settings-proc-list"
            ref={listRef}
            onScroll={handleListScroll}
          >
            {loading ? (
              <div className="adv-click-points-empty">
                Loading applications...
              </div>
            ) : processes.length === 0 ? (
              <div className="adv-click-points-empty">No processes found.</div>
            ) : searchQuery.length >= 1 &&
              checkedProcesses.length === 0 &&
              uncheckedProcesses.length === 0 ? (
              <div
                className="adv-click-points-empty"
                style={PROC_EMPTY_SEARCH_STYLE}
              >
                No process named &quot;{searchQuery}&quot;
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
                    <div style={PROC_DIVIDER_STYLE} />
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

const ProcessRow = memo(function ProcessRow({
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
});
