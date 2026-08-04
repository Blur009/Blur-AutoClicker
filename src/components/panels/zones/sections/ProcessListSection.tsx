import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "../../../../store";
import type { ProcessListEntry } from "../../../../settingsSchema";

import {
  Disableable,
  ToggleBtn,
  CardDivider,
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

export default function ProcessListSection({ settings, update }: Props) {
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
    <div className="adv-sectioncontainer adv-process-list-section">
      <div className="adv-card-header">
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span className="adv-card-title">프로세스 목록</span>
        </div>
        <ToggleBtn
          value={settings.processListEnabled}
          onChange={(v) => update({ processListEnabled: v })}
        />
      </div>
      <CardDivider />
      <div className="adv-card-desc">
        특정 앱이 활성화되어 있을 때 클릭을 중지합니다. 허용 목록 또는 차단
        목록 방식과 함께 사용하세요.
      </div>
      <Disableable
        enabled={settings.processListEnabled}
        disabledReason="프로세스 목록을 켜야 앱 규칙을 관리할 수 있습니다."
      >
        <div className="adv-row" style={{ marginBottom: "0.5rem" }}>
          <div className="adv-seg-group">
            <button
              type="button"
              className={`adv-seg-btn ${settings.processListMode === "whitelist" ? "active" : ""}`}
              onClick={() => update({ processListMode: "whitelist" })}
            >
              허용 목록
            </button>
            <button
              type="button"
              className={`adv-seg-btn ${settings.processListMode === "blacklist" ? "active" : ""}`}
              onClick={() => update({ processListMode: "blacklist" })}
            >
              차단 목록
            </button>
          </div>
          <input
            type="text"
            className="adv-proc-search"
            placeholder={`앱 ${processes.length}개에서 검색`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {settings.processListMode === "whitelist" &&
        settings.processListEntries.length === 0 ? (
          <div className="adv-whitelist-warning">
            허용 목록 모드에 선택된 앱이 없습니다. 모든 곳에서 클릭이
            차단됩니다.
          </div>
        ) : null}
        <div className="adv-process-list">
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
              "{searchQuery}" 이름의 프로세스가 없습니다.
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
        className="adv-proc-checkbox"
        checked={isChecked}
        onChange={(e) => onToggleEntry(proc.name, e.target.checked)}
      />
      {proc.iconBase64 ? (
        <img src={proc.iconBase64} alt="" className="adv-proc-icon" />
      ) : null}
      <span className="adv-proc-name">{proc.displayName}</span>
      <span className="adv-proc-exe">{proc.name}</span>
    </label>
  );
}
