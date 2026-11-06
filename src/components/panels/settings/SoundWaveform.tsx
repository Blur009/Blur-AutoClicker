import { useCallback, useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "@animateicons/react/lucide";
import {
  computePeaks,
  formatSoundTime,
  MIN_TRIM_MS,
  trimBounds,
} from "../../../soundTrim";

const BUCKETS = 240;
const HANDLE_HIT_PX = 18;
const STEP_MS = 10;
const PAGE_STEP_MS = 250;
const MAX_CACHED_WAVES = 4;

type Wave = { peaks: number[]; durationMs: number };
const waveCache = new Map<string, Wave>();

let sharedContext: AudioContext | null = null;
function audioContext(): AudioContext | null {
  if (sharedContext) return sharedContext;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedContext = new Ctor();
  } catch {
    return null;
  }
  return sharedContext;
}

interface Props {
  src: string;
  label: string;
  active?: boolean;
  volume?: number;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
  onPreview: () => void;
  onStop: () => void;
  playback?: HTMLAudioElement | null;
  previewSeq?: number;
}

export default function SoundWaveform({
  src,
  label,
  active = true,
  volume = 100,
  trimStart,
  trimEnd,
  onTrimChange,
  onPreview,
  onStop,
  playback = null,
  previewSeq = 0,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [wave, setWave] = useState<Wave | null>(null);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState<null | "start" | "end">(null);
  const [playheadMs, setPlayheadMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const adopt = (next: Wave) => {
      if (cancelled) return;
      setWave(next);
      setFailed(false);
    };

    const cached = waveCache.get(src);
    if (cached) {
      adopt(cached);
      return;
    }
    if (!active) return;

    void (async () => {
      try {
        setWave(null);
        setFailed(false);
        const context = audioContext();
        if (!context) throw new Error("no audio context");
        const response = await fetch(src);
        if (!response.ok) throw new Error(`status ${response.status}`);
        const buffer = await context.decodeAudioData(
          await response.arrayBuffer(),
        );
        const next: Wave = {
          peaks: computePeaks(buffer.getChannelData(0), BUCKETS),
          durationMs: buffer.duration * 1000,
        };
        if (waveCache.size >= MAX_CACHED_WAVES) {
          const oldest = waveCache.keys().next();
          if (!oldest.done) waveCache.delete(oldest.value);
        }
        waveCache.set(src, next);
        adopt(next);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src, active]);

  const durationMs = wave?.durationMs ?? 0;
  const peaks = wave?.peaks ?? null;
  const bounds = trimBounds(trimStart, trimEnd, durationMs);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width <= 0 || height <= 0) return;

    const ratio = window.devicePixelRatio || 1;
    const bitmapWidth = Math.round(width * ratio);
    const bitmapHeight = Math.round(height * ratio);
    if (canvas.width !== bitmapWidth) canvas.width = bitmapWidth;
    if (canvas.height !== bitmapHeight) canvas.height = bitmapHeight;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const styles = getComputedStyle(canvas);
    const active = styles.getPropertyValue("--wave-active").trim();
    const muted = styles.getPropertyValue("--wave-muted").trim();
    if (!active || !muted) return;

    const startX = durationMs > 0 ? (bounds.start / durationMs) * width : 0;
    const endX = durationMs > 0 ? (bounds.end / durationMs) * width : width;

    const barWidth = Math.max(1, width / peaks.length - 0.5);
    peaks.forEach((peak, index) => {
      const x = (index / peaks.length) * width;
      const inside = x >= startX && x + barWidth <= endX;
      const barHeight = Math.max(1, peak * (height - 10));
      context.fillStyle = inside ? active : muted;
      context.globalAlpha = inside ? 0.95 : 0.5;
      context.fillRect(x, (height - barHeight) / 2, barWidth, barHeight);
    });
    context.globalAlpha = 1;
  }, [peaks, bounds.start, bounds.end, durationMs]);

  const drawRef = useRef(draw);
  const colorsRef = useRef({ active: "", muted: "" });

  useEffect(() => {
    drawRef.current = draw;
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const styles = getComputedStyle(canvas);
    const active = styles.getPropertyValue("--wave-active").trim();
    const muted = styles.getPropertyValue("--wave-muted").trim();
    if (
      active === colorsRef.current.active &&
      muted === colorsRef.current.muted
    ) {
      return;
    }
    colorsRef.current = { active, muted };
    drawRef.current();
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => drawRef.current());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playback) return;
    let frame = requestAnimationFrame(function tick() {
      if (playback.paused || playback.ended) {
        setPlayheadMs(null);
        return;
      }
      setPlayheadMs(playback.currentTime * 1000);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playback, previewSeq]);

  const msAt = useCallback(
    (clientX: number): number => {
      const canvas = canvasRef.current;
      if (!canvas || durationMs <= 0) return 0;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)),
      );
      return Math.round(ratio * durationMs);
    },
    [durationMs],
  );

  const pxAt = (ms: number): number => {
    const canvas = canvasRef.current;
    if (!canvas || durationMs <= 0) return 0;
    return (ms / durationMs) * canvas.getBoundingClientRect().width;
  };

  const moveStart = useCallback(
    (value: number) => {
      const start = Math.min(
        Math.max(0, value),
        Math.max(0, bounds.end - MIN_TRIM_MS),
      );
      onTrimChange(start, bounds.end);
    },
    [bounds.end, onTrimChange],
  );

  const moveEnd = useCallback(
    (value: number) => {
      const end = Math.min(
        durationMs,
        Math.max(bounds.start + MIN_TRIM_MS, value),
      );
      onTrimChange(bounds.start, end);
    },
    [bounds.start, durationMs, onTrimChange],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (durationMs <= 0) return;
    const at = msAt(event.clientX);
    const nearPx = Math.min(
      Math.abs(pxAt(at) - pxAt(bounds.start)),
      Math.abs(pxAt(at) - pxAt(bounds.end)),
    );
    if (nearPx > HANDLE_HIT_PX) return;

    const toStart = Math.abs(at - bounds.start);
    const toEnd = Math.abs(at - bounds.end);
    setDragging(toStart <= toEnd ? "start" : "end");
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleKeyDown = (
    handle: "start" | "end",
    event: React.KeyboardEvent,
  ) => {
    const move = handle === "start" ? moveStart : moveEnd;
    const from = handle === "start" ? bounds.start : bounds.end;
    const step = event.shiftKey ? STEP_MS * 10 : STEP_MS;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        move(from - step);
        break;
      case "ArrowRight":
      case "ArrowUp":
        move(from + step);
        break;
      case "PageDown":
        move(from - PAGE_STEP_MS);
        break;
      case "PageUp":
        move(from + PAGE_STEP_MS);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(durationMs);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const percent = (value: number) =>
    durationMs > 0 ? `${(value / durationMs) * 100}%` : "0%";

  const playing = playback !== null && playheadMs !== null;

  return (
    <div className="sound-wave">
      <div
        className="sound-wave-canvas-wrap"
        data-dragging={dragging !== null}
        onPointerDown={handlePointerDown}
        onPointerMove={(event) => {
          if (dragging === "start") moveStart(msAt(event.clientX));
          if (dragging === "end") moveEnd(msAt(event.clientX));
        }}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
      >
        <canvas ref={canvasRef} className="sound-wave-canvas" />
        {!peaks && (
          <span className="sound-wave-status">
            {failed ? "No waveform for this file." : "Reading waveform..."}
          </span>
        )}
        {peaks && durationMs > 0 && (
          <>
            <span
              className="sound-wave-selection"
              style={{
                left: percent(bounds.start),
                width: percent(bounds.end - bounds.start),
              }}
              aria-hidden="true"
            />
            {playback !== null && playheadMs !== null && (
              <span
                className="sound-wave-playhead"
                style={{ left: percent(playheadMs) }}
                aria-hidden="true"
              />
            )}
            <span
              className="sound-wave-handle sound-wave-handle--start"
              style={{ left: percent(bounds.start) }}
              role="slider"
              tabIndex={0}
              aria-label={`${label} start`}
              aria-valuemin={0}
              aria-valuemax={Math.round(Math.max(0, bounds.end - MIN_TRIM_MS))}
              aria-valuenow={Math.round(bounds.start)}
              aria-valuetext={formatSoundTime(bounds.start)}
              onKeyDown={(event) => handleKeyDown("start", event)}
            />
            <span
              className="sound-wave-handle sound-wave-handle--end"
              style={{ left: percent(bounds.end) }}
              role="slider"
              tabIndex={0}
              aria-label={`${label} end`}
              aria-valuemin={Math.round(bounds.start + MIN_TRIM_MS)}
              aria-valuemax={Math.round(durationMs)}
              aria-valuenow={Math.round(bounds.end)}
              aria-valuetext={formatSoundTime(bounds.end)}
              onKeyDown={(event) => handleKeyDown("end", event)}
            />
          </>
        )}
      </div>
      <div className="sound-wave-footer">
        <span className="sound-wave-times">
          {formatSoundTime(bounds.start)} – {formatSoundTime(bounds.end)}
          <span className="sound-wave-total">
            {" "}
            / {formatSoundTime(durationMs)}
          </span>
        </span>
        <button
          type="button"
          className="settings-btn-quiet sound-wave-preview"
          onClick={() => (playing ? onStop() : onPreview())}
          disabled={durationMs <= 0 || volume <= 0}
          aria-label={
            playing
              ? `Stop ${label.toLowerCase()} preview`
              : `Preview ${label.toLowerCase()} sound`
          }
        >
          {playing ? (
            <PauseIcon size={12} isAnimated={false} aria-hidden="true" />
          ) : (
            <PlayIcon size={12} isAnimated={false} aria-hidden="true" />
          )}
          <span>{playing ? "Stop" : "Preview"}</span>
        </button>
      </div>
    </div>
  );
}
