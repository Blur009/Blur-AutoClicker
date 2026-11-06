export class FakeAudioElement extends EventTarget {
  static instances: FakeAudioElement[] = [];

  static reset(): void {
    FakeAudioElement.instances = [];
  }

  src: string;
  preload = "";
  volume = 1;
  currentTime = 0;
  paused = true;
  ended = false;
  durationValue: number;
  metadataReady: boolean;
  playError: string | null = null;
  playErrorName = "Error";
  playCalls = 0;
  pauseCalls = 0;
  loadCalls = 0;
  released = false;

  constructor(src = "") {
    super();
    this.src = src;
    this.durationValue = 1.5;
    this.metadataReady = false;
    FakeAudioElement.instances.push(this);
  }

  get duration(): number {
    return this.metadataReady ? this.durationValue : Number.NaN;
  }

  play(): Promise<void> {
    this.playCalls += 1;
    if (this.playError) {
      const error = new Error(this.playError);
      error.name = this.playErrorName;
      return Promise.reject(error);
    }
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCalls += 1;
    this.paused = true;
  }

  load(): void {
    this.loadCalls += 1;
    if (this.released) return;
    this.metadataReady = false;
    queueMicrotask(() => {
      if (this.metadataReady) return;
      this.metadataReady = true;
      this.dispatchEvent(new Event("loadedmetadata"));
    });
  }

  removeAttribute(name: string): void {
    if (name === "src") {
      this.src = "";
      this.released = true;
    }
  }

  emitMetadata(durationSeconds = this.durationValue): void {
    this.durationValue = durationSeconds;
    this.metadataReady = true;
    this.dispatchEvent(new Event("loadedmetadata"));
  }
}

export function installFakeAudio(): void {
  FakeAudioElement.reset();
  Object.defineProperty(window, "Audio", {
    configurable: true,
    writable: true,
    value: FakeAudioElement,
  });
  (globalThis as unknown as { Audio: unknown }).Audio = FakeAudioElement;
}
