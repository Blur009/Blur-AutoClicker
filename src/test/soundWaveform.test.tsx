import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SoundWaveform from "../components/panels/settings/SoundWaveform";

function stubAudioPipeline(): void {
  const samples = new Float32Array(2048);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.sin(i / 12) * (1 - i / samples.length);
  }

  class FakeContext {
    async decodeAudioData() {
      return {
        duration: 1.5,
        getChannelData: () => samples,
      };
    }
  }

  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    writable: true,
    value: FakeContext,
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })),
  );
}

type FakeElement = { paused: boolean; ended: boolean; currentTime: number };

function fakeElement(): FakeElement {
  return { paused: false, ended: false, currentTime: 0.25 };
}

const baseProps = {
  src: "/sounds/click.wav",
  label: "Every click",
  trimStart: 0,
  trimEnd: 0,
  onTrimChange: () => {},
  onPreview: () => {},
  onStop: () => {},
};

beforeEach(() => {
  stubAudioPipeline();
  Object.defineProperty(Element.prototype, "setPointerCapture", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  Object.defineProperty(Element.prototype, "releasePointerCapture", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

describe("SoundWaveform", () => {
  it("draws the trim handles once the file is decoded", async () => {
    render(<SoundWaveform {...baseProps} />);

    await waitFor(() =>
      expect(screen.getByLabelText("Every click start")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Every click end")).toBeInTheDocument();
    expect(screen.getByText("0:00.00 – 0:01.50")).toBeInTheDocument();
  });

  it("shows the playhead again on a repeated preview of the same element", async () => {
    const element = fakeElement();
    const asAudio = () => element as unknown as HTMLAudioElement;
    const { rerender } = render(
      <SoundWaveform {...baseProps} playback={null} previewSeq={0} />,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Every click start")).toBeInTheDocument(),
    );
    expect(document.querySelector(".sound-wave-playhead")).toBeNull();

    rerender(
      <SoundWaveform {...baseProps} playback={asAudio()} previewSeq={1} />,
    );
    await waitFor(() =>
      expect(document.querySelector(".sound-wave-playhead")).not.toBeNull(),
    );

    element.paused = true;
    await waitFor(() =>
      expect(document.querySelector(".sound-wave-playhead")).toBeNull(),
    );

    element.paused = false;
    rerender(
      <SoundWaveform {...baseProps} playback={asAudio()} previewSeq={2} />,
    );
    await waitFor(() =>
      expect(document.querySelector(".sound-wave-playhead")).not.toBeNull(),
    );
  });
  it("stops instead of restarting when the button is pressed while playing", async () => {
    const element = fakeElement();
    const onPreview = vi.fn();
    const onStop = vi.fn();
    render(
      <SoundWaveform
        {...baseProps}
        onPreview={onPreview}
        onStop={onStop}
        playback={element as unknown as HTMLAudioElement}
        previewSeq={1}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /stop every click preview/i }),
      ).toBeInTheDocument(),
    );

    await userEvent.click(
      screen.getByRole("button", { name: /stop every click preview/i }),
    );

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onPreview).not.toHaveBeenCalled();
  });
});

function wideCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector("canvas") as HTMLCanvasElement;
  canvas.getBoundingClientRect = () =>
    ({
      left: 0,
      right: 1500,
      width: 1500,
      top: 0,
      bottom: 56,
      height: 56,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return canvas;
}

async function renderReady(overrides: Partial<typeof baseProps> = {}) {
  const onTrimChange = vi.fn();
  const view = render(
    <SoundWaveform {...baseProps} onTrimChange={onTrimChange} {...overrides} />,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Every click start")).toBeInTheDocument(),
  );
  return { onTrimChange, ...view };
}

describe("SoundWaveform keys", () => {
  it("moves the focused handle with the arrow keys and swallows the scroll", async () => {
    const { onTrimChange } = await renderReady();

    const start = screen.getByLabelText("Every click start");
    start.focus();

    expect(fireEvent.keyDown(start, { key: "ArrowUp" })).toBe(false);
    expect(onTrimChange).toHaveBeenLastCalledWith(10, 1500);

    fireEvent.keyDown(start, { key: "ArrowDown" });
    expect(onTrimChange).toHaveBeenLastCalledWith(0, 1500);

    fireEvent.keyDown(start, { key: "ArrowRight" });
    expect(onTrimChange).toHaveBeenLastCalledWith(10, 1500);

    fireEvent.keyDown(start, { key: "ArrowRight", shiftKey: true });
    expect(onTrimChange).toHaveBeenLastCalledWith(100, 1500);

    fireEvent.keyDown(start, { key: "PageUp" });
    expect(onTrimChange).toHaveBeenLastCalledWith(250, 1500);
  });

  it("jumps to the ends with Home and End", async () => {
    const { onTrimChange } = await renderReady({
      trimStart: 300,
      trimEnd: 900,
    });

    const start = screen.getByLabelText("Every click start");
    fireEvent.keyDown(start, { key: "Home" });
    expect(onTrimChange).toHaveBeenLastCalledWith(0, 900);

    const end = screen.getByLabelText("Every click end");
    fireEvent.keyDown(end, { key: "End" });
    expect(onTrimChange).toHaveBeenLastCalledWith(300, 1500);

    fireEvent.keyDown(end, { key: "Home" });
    expect(onTrimChange).toHaveBeenLastCalledWith(300, 320);
  });

  it("leaves other keys to the panel", async () => {
    const { onTrimChange } = await renderReady();

    const start = screen.getByLabelText("Every click start");
    expect(fireEvent.keyDown(start, { key: "Tab" })).toBe(true);
    expect(onTrimChange).not.toHaveBeenCalled();
  });
});

describe("SoundWaveform dragging", () => {
  it("ignores a press that lands away from both handles", async () => {
    const { onTrimChange } = await renderReady();
    wideCanvas();

    const wrap = document.querySelector(".sound-wave-canvas-wrap")!;
    fireEvent.pointerDown(wrap, { clientX: 700, pointerId: 1 });
    fireEvent.pointerMove(wrap, { clientX: 800, pointerId: 1 });

    expect(onTrimChange).not.toHaveBeenCalled();
  });

  it("drags the nearest handle and keeps the region at least 20 ms wide", async () => {
    const { onTrimChange } = await renderReady({
      trimStart: 0,
      trimEnd: 1500,
    });
    wideCanvas();

    const wrap = document.querySelector(".sound-wave-canvas-wrap")!;
    fireEvent.pointerDown(wrap, { clientX: 1495, pointerId: 1 });
    expect(wrap.getAttribute("data-dragging")).toBe("true");

    fireEvent.pointerMove(wrap, { clientX: 10, pointerId: 1 });
    expect(onTrimChange).toHaveBeenLastCalledWith(0, 20);

    fireEvent.pointerUp(wrap, { pointerId: 1 });
    expect(wrap.getAttribute("data-dragging")).toBe("false");
  });
});

describe("SoundWaveform loading", () => {
  it("does not fetch the file until the editor is open", async () => {
    vi.mocked(globalThis.fetch).mockClear();
    render(
      <SoundWaveform {...baseProps} src="/sounds/closed.wav" active={false} />,
    );

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(screen.getByText("Reading waveform...")).toBeInTheDocument();
  });

  it("says so when the file cannot be read", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    render(<SoundWaveform {...baseProps} src="/sounds/missing.wav" />);

    await waitFor(() =>
      expect(
        screen.getByText("No waveform for this file."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByLabelText("Every click start"),
    ).not.toBeInTheDocument();
  });
});
