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
      title="프로세스 목록"
      description="특정 앱이 활성화되어 있을 때 클릭을 중지합니다."
    >
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">사용</span>
          <span className="settings-sublabel">
            활성 앱을 기준으로 클릭을 중지합니다.
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
          <span className="settings-label">방식</span>
          <span className="settings-sublabel">
            허용 목록은 선택한 앱에서만 클릭을 허용하고, 차단 목록은 선택한 앱을 차단합니다.
          </span>
        </div>
        <div className="settings-seg-group">
          <button
            type="button"
            className={`settings-seg-btn ${settings.processListMode === "whitelist" ? "active" : ""}`}
            onClick={() => update({ processListMode: "whitelist" })}
          >
            허용 목록
          </button>
          <button
            type="button"
            className={`settings-seg-btn ${settings.processListMode === "blacklist" ? "active" : ""}`}
            onClick={() => update({ processListMode: "blacklist" })}
          >
            차단 목록
          </button>
        </div>
      </div>

      <CardDivider />

      <Disableable
        enabled={settings.processListEnabled}
        disabledReason="프로세스 목록을 켜야 앱 규칙을 관리할 수 있습니다."
      >
        {settings.processListMode === "whitelist" &&
        settings.processListEntries.length === 0 ? (
          <div className="settings-whitelist-warning">
              허용 목록 모드에 선택된 앱이 없습니다. 모든 곳에서 클릭이
              차단됩니다.
          </div>
        ) : null}

        <div className="settings-proc-search-row">
          <input
            type="text"
            className="settings-proc-search"
            placeholder={`앱 ${processes.length}개에서 검색`}
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
              <div className="adv-click-points-empty">새로 고치는 중...</div>
            ) : processes.length === 0 ? (
              <div className="adv-click-points-empty">
                프로세스를 찾을 수 없습니다. 새로 고쳐 보세요.
              </div>
            ) : searchQuery.length >= 1 &&
              checkedProcesses.length === 0 &&
              uncheckedProcesses.length === 0 ? (
              <div
                className="adv-click-points-empty"
                style={{ textAlign: "center", padding: "1rem" }}
              >
                &quot;{searchQuery}&quot; 이름의 프로세스가 없습니다.
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
