import "./TelemetryConsent.css";

interface Props {
  version: string;
  onAccept: () => void;
  onDecline: () => void;
}

export default function TelemetryConsent({ version, onAccept, onDecline }: Props) {
  return (
    <div className="consent-backdrop">
      <div className="consent-card">
        <div className="consent-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>

        <h1 className="consent-title">Help improve this app?</h1>

        <p className="consent-body">
          Share anonymous usage data to help improve the app. This includes click counts, session times, CPU usage and more — no personal data as defined by GDPR Article 4(1).
        </p>

        <ul className="consent-list">
          <li>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            No personal information collected
          </li>
          <li>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            Data viewable publicly on our website
          </li>
          <li>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            Toggleable anytime in Settings
          </li>
        </ul>

        <p className="consent-note">
          v{version}
        </p>

        <div className="consent-actions">
          <button className="consent-btn consent-btn--primary" onClick={onAccept}>
            Share anonymous data
          </button>
          <button className="consent-btn consent-btn--ghost" onClick={onDecline}>
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
