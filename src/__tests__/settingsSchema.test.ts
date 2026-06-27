import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEQUENCE_KEY_HOLD_MS,
  SETTINGS_LIMITS,
  hasKeyOnlySequenceActions,
  sanitizeSettings,
  type SequencePoint,
  type Settings,
} from "../settingsSchema";

describe("settings schema sequence actions", () => {
  it("keeps legacy mouse sequence points compatible", () => {
    const settings = sanitizeSettings(
      {
        sequencePoints: [
          { id: "legacy-mouse", x: 12.8, y: 34.2, clicks: 2.9 },
          { id: "invalid-mouse", action: "mouse", x: "bad", y: 20 },
        ],
      } as unknown as Partial<Settings>,
      "test",
    );

    expect(settings.sequencePoints).toEqual([
      {
        id: "legacy-mouse",
        action: "mouse",
        x: 12,
        y: 34,
        clicks: 2,
      },
    ]);
  });

  it("sanitizes key sequence points with safe defaults and limits", () => {
    const settings = sanitizeSettings(
      {
        sequencePoints: [
          {
            id: "key-with-default-hold",
            action: "key",
            key: " W ",
            keyCase: "upper",
            clicks: 2.9,
          },
          {
            id: "key-with-limited-hold",
            action: "key",
            key: 42,
            keyCase: "invalid",
            holdMs: 999999,
            clicks: -5,
          },
        ],
      } as unknown as Partial<Settings>,
      "test",
    );

    expect(settings.sequencePoints).toEqual([
      {
        id: "key-with-default-hold",
        action: "key",
        key: "W",
        keyCase: "upper",
        holdMs: DEFAULT_SEQUENCE_KEY_HOLD_MS,
        clicks: 2,
      },
      {
        id: "key-with-limited-hold",
        action: "key",
        key: "",
        keyCase: "lower",
        holdMs: SETTINGS_LIMITS.sequenceKeyHoldMs.max,
        clicks: 1,
      },
    ]);
  });

  it("only marks click duration unavailable for enabled key-only sequences", () => {
    const keyPoint: SequencePoint = {
      id: "key",
      action: "key",
      key: "w",
      keyCase: "lower",
      holdMs: DEFAULT_SEQUENCE_KEY_HOLD_MS,
      clicks: 1,
    };
    const mousePoint: SequencePoint = {
      id: "mouse",
      action: "mouse",
      x: 10,
      y: 20,
      clicks: 1,
    };

    expect(
      hasKeyOnlySequenceActions({
        sequenceEnabled: false,
        sequencePoints: [keyPoint],
      }),
    ).toBe(false);
    expect(
      hasKeyOnlySequenceActions({
        sequenceEnabled: true,
        sequencePoints: [],
      }),
    ).toBe(false);
    expect(
      hasKeyOnlySequenceActions({
        sequenceEnabled: true,
        sequencePoints: [keyPoint],
      }),
    ).toBe(true);
    expect(
      hasKeyOnlySequenceActions({
        sequenceEnabled: true,
        sequencePoints: [keyPoint, mousePoint],
      }),
    ).toBe(false);
  });
});
