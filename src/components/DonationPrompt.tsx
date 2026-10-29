import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { DONATION_MESSAGE, donationStat } from "../donationReminders";
import type { DonationPrompt as DonationPromptState } from "../donationReminders";
import { popConfetti } from "../confetti";
import { lookFromPointer, lookTransform } from "../mascotLook";
import type { LookVector } from "../mascotLook";
import "./DonationPrompt.css";

type Outcome = "thanks" | "declined";

const OUTCOME_MS = 1800;
const CURSOR_POLL_MS = 45;

function prefersReducedMotion(): boolean {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

interface Props {
  prompt: DonationPromptState | null;
  testMarker?: string;
  onSupport: () => void;
  onAcknowledge: () => void;
  onClose: () => void;
}

export default function DonationPrompt({
  prompt,
  testMarker,
  onSupport,
  onAcknowledge,
  onClose,
}: Props) {
  const [settled, setSettled] = useState<{
    prompt: DonationPromptState;
    outcome: Outcome;
  } | null>(null);
  const [look, setLook] = useState<LookVector>({ x: 0, y: 0 });
  const mascotSlotRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | null>(null);
  const acknowledgedPromptRef = useRef<DonationPromptState | null>(null);

  const outcome = settled && settled.prompt === prompt ? settled.outcome : null;

  const lookAt = useCallback((pointX: number, pointY: number) => {
    const slot = mascotSlotRef.current;
    if (!slot || prefersReducedMotion()) return;
    setLook(lookFromPointer(slot.getBoundingClientRect(), pointX, pointY));
  }, []);

  const trackPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    lookAt(event.clientX, event.clientY);
  };

  const resetLook = () => setLook({ x: 0, y: 0 });

  const acknowledge = useCallback(() => {
    if (!prompt || acknowledgedPromptRef.current === prompt) return;
    acknowledgedPromptRef.current = prompt;
    onAcknowledge();
  }, [prompt, onAcknowledge]);

  const finish = useCallback(
    (next: Outcome) => {
      if (!prompt || outcome !== null) return;
      setSettled({ prompt, outcome: next });
      acknowledge();
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(onClose, OUTCOME_MS);
    },
    [prompt, outcome, acknowledge, onClose],
  );

  useEffect(() => {
    if (!prompt) return;

    let cancelled = false;
    let inFlight = false;

    const follow = async () => {
      if (inFlight || prefersReducedMotion()) return;
      inFlight = true;
      try {
        const point = await invoke<{ x: number; y: number } | null>(
          "get_cursor_position",
        );
        if (cancelled || !point) return;
        const ratio = window.devicePixelRatio || 1;
        lookAt(point.x / ratio, point.y / ratio);
      } catch {
        return;
      } finally {
        inFlight = false;
      }
    };

    const timer = window.setInterval(() => void follow(), CURSOR_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [prompt, lookAt]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [prompt]);

  useEffect(() => {
    if (!prompt) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      acknowledge();
      onClose();
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [prompt, acknowledge, onClose]);

  if (!prompt) return null;

  const host =
    document.querySelector<HTMLElement>(".app-root") ?? document.body;

  return createPortal(
    <div
      className="donation-prompt-backdrop"
      onPointerMove={trackPointer}
      onPointerLeave={resetLook}
      onClick={() => {
        acknowledge();
        onClose();
      }}
    >
      <div
        className="donation-prompt-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="donation-prompt-mascot-slot" ref={mascotSlotRef}>
          <img
            className="donation-prompt-mascot"
            src="/mascot-cat.png"
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{ transform: lookTransform(look) }}
          />
        </span>
        <div
          className="donation-prompt"
          role="dialog"
          aria-labelledby="donation-prompt-eyebrow donation-prompt-title"
        >
          {testMarker ? (
            <span className="dialog-test-marker">{testMarker}</span>
          ) : null}
          {outcome ? (
            <div className="donation-prompt-final" key={outcome}>
              <h2 className="donation-prompt-title" id="donation-prompt-title">
                {outcome === "thanks" ? "Thank you." : "Enjoy the autoclicker."}
              </h2>
              <p className="donation-prompt-note">
                {outcome === "thanks"
                  ? "Every bit helps."
                  : "Thanks for using it."}
              </p>
            </div>
          ) : (
            <>
              <p
                className="donation-prompt-eyebrow"
                id="donation-prompt-eyebrow"
              >
                You've reached
              </p>
              <h2 className="donation-prompt-title" id="donation-prompt-title">
                {prompt.milestone.label}
              </h2>
              <p className="donation-prompt-stat">{donationStat(prompt)}</p>
              <div className="donation-prompt-divider" aria-hidden="true" />
              <p className="donation-prompt-message">{DONATION_MESSAGE}</p>
              <div className="donation-prompt-actions">
                <button
                  type="button"
                  className="donation-prompt-btn donation-prompt-btn--decline"
                  onClick={() => finish("declined")}
                >
                  No, Thank you
                </button>
                <button
                  type="button"
                  className="donation-prompt-btn donation-prompt-btn--support"
                  onClick={(event) => {
                    popConfetti(event.clientX, event.clientY);
                    onSupport();
                    finish("thanks");
                  }}
                >
                  Support Me
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    host,
  );
}
