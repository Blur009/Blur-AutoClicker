import { useEffect, useRef, useState } from "react";
import "./StatusBar.css";

interface Props {
  activePresetName: string | null;
  version: string;
  stopReason: string | null;
  warning: string | null;
  running: boolean;
  paused: boolean;
  clickCount: number;
  activeClickPointIndex: number | null;
  totalClickPoints: number;
  clickLimit: number;
  clickLimitEnabled: boolean;
  timeLimitMs: number;
  onGoToPresets: () => void;
  onGoToVersionInfo: () => void;
}

const STOP_REASON_TEXTS: Record<string, string> = {
  "Stopped from UI": "사용자 인터페이스에서 중지됨",
  "Stopped from toggle": "전환으로 중지됨",
  "Stopped from hotkey": "단축키로 중지됨",
  "Stopped from hold hotkey": "누르기 단축키로 중지됨",
  "Stopped for hotkey input": "단축키 입력을 위해 중지됨",
  Stopped: "중지됨",
  "Top-left corner failsafe": "왼쪽 위 모서리 안전장치",
  "Top-right corner failsafe": "오른쪽 위 모서리 안전장치",
  "Bottom-left corner failsafe": "왼쪽 아래 모서리 안전장치",
  "Bottom-right corner failsafe": "오른쪽 아래 모서리 안전장치",
  "Top edge failsafe": "위쪽 가장자리 안전장치",
  "Right edge failsafe": "오른쪽 가장자리 안전장치",
  "Bottom edge failsafe": "아래쪽 가장자리 안전장치",
  "Left edge failsafe": "왼쪽 가장자리 안전장치",
  "Blocked by Alt+Tab": "Alt+Tab으로 차단됨",
  "Blocked by process list": "프로세스 목록으로 차단됨",
  "All click points completed": "모든 클릭 지점 완료",
  "Custom stop zone failsafe": "사용자 지정 영역 안전장치",
  "Left start zone": "시작 영역에서 나감",
};

function translateStopReason(stopReason: string | null | undefined): string {
  if (!stopReason) return "";
  const staticText = STOP_REASON_TEXTS[stopReason];
  if (staticText) return staticText;

  const clickLimit = stopReason.match(/^Click limit reached \((.+)\)$/);
  if (clickLimit) {
    return `클릭 제한 도달 (${clickLimit[1]})`;
  }

  const timeLimit = stopReason.match(/^Time limit reached \((.+)\)$/);
  if (timeLimit) {
    return `시간 제한 도달 (${timeLimit[1]})`;
  }

  return stopReason;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function StatusBar({
  activePresetName,
  version,
  stopReason,
  warning,
  running,
  paused,
  clickCount,
  activeClickPointIndex,
  totalClickPoints,
  clickLimit,
  clickLimitEnabled,
  timeLimitMs,
  onGoToPresets,
  onGoToVersionInfo,
}: Props) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const baseElapsedRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (running && !paused) {
      segmentStartRef.current = Date.now();
      const tick = () => {
        setElapsedMs(
          baseElapsedRef.current + (Date.now() - segmentStartRef.current!),
        );
      };
      tick();
      intervalRef.current = setInterval(tick, 200);
    } else if (running && paused) {
      if (segmentStartRef.current !== null) {
        baseElapsedRef.current += Date.now() - segmentStartRef.current;
        segmentStartRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      baseElapsedRef.current = 0;
      segmentStartRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running, paused]);

  let centerText = "";
  let hasWarning = false;

  if (warning) {
    centerText = `⚠ ${translateWarning(warning)}`;
    hasWarning = true;
  } else if (running) {
    const parts: string[] = [];

    if (paused) {
      parts.push("일시 정지");
    }

    if (totalClickPoints > 1 && activeClickPointIndex !== null) {
      parts.push(`지점 ${activeClickPointIndex + 1}/${totalClickPoints}`);
    }

    const elapsed = formatElapsed(elapsedMs);
    if (timeLimitMs > 0) {
      parts.push(`${elapsed} / ${formatElapsed(timeLimitMs)}`);
    } else {
      parts.push(elapsed);
    }

    if (clickLimitEnabled && clickLimit > 0) {
      parts.push(`${clickCount} / ${clickLimit}클릭`);
    } else if (clickCount > 0) {
      parts.push(`${clickCount}클릭`);
    }

    if (paused && stopReason) {
      parts.push(translateStopReason(stopReason));
    }

    centerText = parts.join("\u00A0\u00A0•\u00A0\u00A0");
  } else if (stopReason) {
    const reason = translateStopReason(stopReason);
    centerText = clickCount > 0 ? `${reason} • ${clickCount} clicks` : reason;
  }

  return (
    <div className="status-bar" data-running={running}>
      <div className="status-bar-left">
        {activePresetName ? (
          <button
            className="status-bar-preset-btn"
            onClick={onGoToPresets}
            title="프리셋으로 이동"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
            </svg>
            {activePresetName}
          </button>
        ) : (
          <button
            className="status-bar-hint-btn"
            onClick={onGoToPresets}
            title="프리셋으로 이동"
          >
            활성 프리셋 없음
          </button>
        )}
      </div>
      <div
        className={`status-bar-center ${hasWarning ? "status-bar-center--warning" : ""} ${centerText ? "" : "status-bar-center--empty"}`}
      >
        {centerText}
      </div>
      <div className="status-bar-right">
        <button
          className="status-bar-version-btn"
          onClick={onGoToVersionInfo}
          title="정보"
        >
          v{version}
        </button>
      </div>
    </div>
  );
}
function translateWarning(warning: string | null): string {
  if (!warning) return "";
  const warnings: Record<string, string> = {
    "Whitelist mode has no entries selected":
      "허용 목록 모드에 선택된 앱이 없습니다.",
    "Finish setting hotkey first": "먼저 단축키 설정을 완료하세요.",
  };
  return warnings[warning] ?? warning;
}
