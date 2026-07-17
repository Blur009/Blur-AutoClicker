import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Settings, StopZone } from "../../../../store";
import { error } from "@tauri-apps/plugin-log";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  NumInput,
  AdvDropdown,
  CardDivider,
  Disableable,
  ToggleBtn,
} from "../../advanced/sections/shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

interface StopZonePickedPayload {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ACTION_OPTIONS = [
  { value: "stop", label: "Stop" },
  { value: "pause", label: "Pause" },
  { value: "start", label: "Start" },
] as const;

function createZoneId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `sz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

export default function StopZonesSection({ settings, update }: Props) {
  const [drawingIndex, setDrawingIndex] = useState<number | null>(null);
  const updateRef = useRef(update);
  const zonesRef = useRef<StopZone[]>(settings.stopZones ?? []);
  const pendingIndexRef = useRef<number | null>(null);

  const zones = useMemo(() => settings.stopZones ?? [], [settings.stopZones]);

  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  useEffect(() => {
    let disposed = false;
    let unlistenPicked: (() => void) | null = null;
    let unlistenEnded: (() => void) | null = null;

    void listen<StopZonePickedPayload>("custom-stop-zone-picked", (event) => {
      const idx = pendingIndexRef.current;
      if (idx === null) return;
      const current = [...(zonesRef.current ?? [])];
      if (idx < 0 || idx >= current.length) return;
      current[idx] = {
        ...current[idx],
        x: event.payload.x,
        y: event.payload.y,
        width: Math.max(1, event.payload.width),
        height: Math.max(1, event.payload.height),
      };
      updateRef.current({ stopZones: current });
      pendingIndexRef.current = null;
      setDrawingIndex(null);
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlistenPicked = cleanup;
      }
    });

    void listen("custom-stop-zone-pick-ended", () => {
      pendingIndexRef.current = null;
      setDrawingIndex(null);
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlistenEnded = cleanup;
      }
    });

    return () => {
      disposed = true;
      unlistenPicked?.();
      unlistenEnded?.();
      void invoke("cancel_custom_stop_zone_pick");
    };
  }, []);

  const startDraw = useCallback(async (index: number) => {
    pendingIndexRef.current = index;
    setDrawingIndex(index);
    try {
      await invoke("start_custom_stop_zone_pick");
    } catch (err) {
      pendingIndexRef.current = null;
      setDrawingIndex(null);
      error(
        JSON.stringify({
          source: "StopZonesSection.startDraw",
          error: String(err),
        }),
      );
    }
  }, []);

  const cancelDraw = useCallback(async () => {
    pendingIndexRef.current = null;
    setDrawingIndex(null);
    try {
      await invoke("cancel_custom_stop_zone_pick");
    } catch (err) {
      error(
        JSON.stringify({
          source: "StopZonesSection.cancelDraw",
          error: String(err),
        }),
      );
    }
  }, []);

  useEffect(() => {
    if (drawingIndex === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      void cancelDraw();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [cancelDraw, drawingIndex]);

  const updateZone = (index: number, patch: Partial<StopZone>) => {
    const next = zones.map((z, i) => (i === index ? { ...z, ...patch } : z));
    update({ stopZones: next });
  };

  const removeZone = (index: number) => {
    const next = zones.filter((_, i) => i !== index);
    update({ stopZones: next });
  };

  const addZone = () => {
    const next = [
      ...zones,
      {
        id: createZoneId(),
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        action: "stop" as const,
      },
    ];
    update({ stopZones: next });
  };

  return (
    <div className="adv-sectioncontainer">
      <div className="adv-card-header">
        <span className="adv-card-title">Custom Stop Zones</span>
        <ToggleBtn
          value={settings.stopZonesEnabled}
          onChange={(v) => {
            if (drawingIndex !== null && !v) {
              void cancelDraw();
            }
            update({ stopZonesEnabled: v });
          }}
        />
      </div>
      <CardDivider />
      <div className="adv-card-desc">
        Draw zones on screen. The clicker stops, pauses, or starts whenever your
        cursor moves inside a zone.
      </div>
      <Disableable enabled={settings.stopZonesEnabled}>
        {zones.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "6rem 0",
            }}
          >
            <button
              type="button"
              className="adv-secondary-btn"
              style={{
                fontSize: "1rem",
                padding: "0.625rem 1.75rem",
                background: "var(--accent-soft)",
                borderColor: "var(--accent-ring)",
                color: "var(--text-primary)",
              }}
              onClick={addZone}
            >
              Add Zone
            </button>
            <div className="adv-zones-empty">
              <div className="adv-zones-empty-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect
                    x="3"
                    y="3"
                    width="18"
                    height="18"
                    rx="2"
                    strokeDasharray="4 3"
                  />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </div>
              <div className="adv-zones-empty-title">No zones yet</div>
              <div className="adv-zones-empty-hint">
                Click <strong>Add Zone</strong> above, then click{" "}
                <strong>Draw</strong> on a row to define its area on screen.
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.3125rem",
              marginTop: "0.625rem",
            }}
          >
            {zones.map((zone, index) => (
              <div key={zone.id} className="adv-zone-row">
                <span className="adv-zone-index">{index + 1}</span>
                <label className="adv-numbox-sm adv-zone-coord">
                  <span className="adv-unit">X</span>
                  <NumInput
                    hoverWheel={false}
                    value={zone.x}
                    onChange={(v) => updateZone(index, { x: v })}
                    min={0}
                  />
                </label>
                <label className="adv-numbox-sm adv-zone-coord">
                  <span className="adv-unit">Y</span>
                  <NumInput
                    hoverWheel={false}
                    value={zone.y}
                    onChange={(v) => updateZone(index, { y: v })}
                    min={0}
                  />
                </label>
                <label className="adv-numbox-sm adv-zone-coord">
                  <span className="adv-unit">W</span>
                  <NumInput
                    hoverWheel={false}
                    value={zone.width}
                    onChange={(v) =>
                      updateZone(index, { width: Math.max(1, v) })
                    }
                    min={1}
                  />
                </label>
                <label className="adv-numbox-sm adv-zone-coord">
                  <span className="adv-unit">H</span>
                  <NumInput
                    hoverWheel={false}
                    value={zone.height}
                    onChange={(v) =>
                      updateZone(index, { height: Math.max(1, v) })
                    }
                    min={1}
                  />
                </label>
                <div style={{ minWidth: 0 }}>
                  <AdvDropdown
                    value={zone.action}
                    options={ACTION_OPTIONS}
                    onChange={(v) =>
                      updateZone(index, {
                        action: v as "stop" | "pause" | "start",
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  className="adv-zone-draw-btn"
                  onClick={() =>
                    void (drawingIndex === index
                      ? cancelDraw()
                      : startDraw(index))
                  }
                >
                  {drawingIndex === index ? "Cancel" : "Draw"}
                </button>
                <button
                  type="button"
                  className="adv-click-points-delete"
                  onClick={() => removeZone(index)}
                  aria-label="Delete"
                  title="Delete"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 12 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M2.5 3.5H9.5M4.25 3.5V2.75C4.25 2.34 4.59 2 5 2H7C7.41 2 7.75 2.34 7.75 2.75V3.5M8.75 3.5V9C8.75 9.55 8.3 10 7.75 10H4.25C3.7 10 3.25 9.55 3.25 9V3.5M5 5.25V8.25M7 5.25V8.25"
                      stroke="currentColor"
                      strokeWidth="1.1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginTop: "0.25rem",
              }}
            >
              <button
                type="button"
                className="adv-secondary-btn"
                onClick={addZone}
              >
                Add Zone
              </button>
            </div>
          </div>
        )}
      </Disableable>
    </div>
  );
}
