interface Props {
  label: string;
  disabled: boolean;
  onClick: () => void;
}

export default function ResetButton({ label, disabled, onClick }: Props) {
  return (
    <button
      type="button"
      className="theme-icon-btn"
      aria-label={label}
      title={label}
      aria-disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </svg>
    </button>
  );
}
