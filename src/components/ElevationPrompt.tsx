import { memo } from "react";
import "./ElevationPrompt.css";

interface Props {
  open: boolean;
  canElevate: boolean;
  alwaysRunAsAdmin: boolean;
  busy: boolean;
  onRestart: () => void;
  onAlwaysRunChange: (next: boolean) => void;
  onDismiss: () => void;
}

const ElevationPrompt = memo(function ElevationPrompt({
  open,
  canElevate,
  alwaysRunAsAdmin,
  busy,
  onRestart,
  onAlwaysRunChange,
  onDismiss,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="elevation-prompt"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="elevation-prompt-title"
    >
      <div className="elevation-prompt-card">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="lucide lucide-user-shield elevation-prompt-icon"
        >
          <path d="M10 15H6a4 4 0 0 0-4 4v2" />
          <path d="M22 17.5c0 2.499-1.75 3.749-3.83 4.474a.5.5 0 0 1-.335-.005c-2.085-.72-3.835-1.97-3.835-4.47V14a.5.5 0 0 1 .5-.499c1 0 2.25-.6 3.12-1.36a.6.6 0 0 1 .76-.001c.875.765 2.12 1.36 3.12 1.36a.5.5 0 0 1 .5.5z" />
          <circle cx="9" cy="7" r="4" />
        </svg>

        <h2 id="elevation-prompt-title" className="elevation-prompt-title">
          This window runs as administrator
        </h2>
        <p className="elevation-prompt-body">
          Windows blocks normal apps from clicking or typing into an
          administrator window. Restart Blur Auto Clicker as administrator to
          click it.
        </p>

        <button
          type="button"
          className={`elevation-prompt-toggle ${alwaysRunAsAdmin ? "on" : "off"}`}
          aria-pressed={alwaysRunAsAdmin}
          onClick={() => onAlwaysRunChange(!alwaysRunAsAdmin)}
        >
          <span className="elevation-prompt-switch">
            <span className="elevation-prompt-knob" />
          </span>
          <span>Always start as administrator</span>
        </button>

        <div className="elevation-prompt-actions">
          <button
            type="button"
            className="elevation-prompt-btn"
            onClick={onDismiss}
          >
            Not now
          </button>
          <button
            type="button"
            className="elevation-prompt-btn elevation-prompt-btn--primary"
            onClick={onRestart}
            disabled={busy || !canElevate}
          >
            {!canElevate
              ? "Administrator account required"
              : busy
                ? "Restarting…"
                : "Restart as administrator"}
          </button>
        </div>
      </div>
    </div>
  );
});

export default ElevationPrompt;
