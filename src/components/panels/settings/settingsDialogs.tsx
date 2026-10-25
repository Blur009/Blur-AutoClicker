import ConfirmDialog from "../../ConfirmDialog";

interface DialogProps {
  open: boolean;
  busy?: boolean;
  testMarker?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ResetSettingsDialog({
  open,
  busy = false,
  testMarker,
  onConfirm,
  onCancel,
}: DialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title="Reset all settings"
      message="Every setting returns to its default, saved presets are replaced, and Run on Startup is turned off. This cannot be undone."
      confirmLabel="Reset"
      busy={busy}
      testMarker={testMarker}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export function ResetUsageDialog({
  open,
  busy = false,
  testMarker,
  onConfirm,
  onCancel,
}: DialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title="Reset usage data"
      message="Every recorded session is deleted, so the usage charts and totals start over. This cannot be undone."
      confirmLabel="Reset"
      busy={busy}
      testMarker={testMarker}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export function ExtendedSpeedDialog({
  open,
  testMarker,
  onConfirm,
  onCancel,
}: DialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title="Enable extended click speed limit?"
      message="The limit goes from 500 to 1000 clicks per interval. High speeds can stutter on slower PCs."
      confirmLabel="Enable"
      testMarker={testMarker}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export function RestartAdminDialog({
  open,
  busy = false,
  testMarker,
  onConfirm,
  onCancel,
}: DialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title="Restart as administrator?"
      message="The app closes and reopens with administrator rights. Skip the restart and the setting applies next launch."
      confirmLabel="Restart now"
      cancelLabel="Not now"
      busy={busy}
      testMarker={testMarker}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
