const EDGE_MARGIN = 8;

export function dropdownLeft(
  triggerLeft: number,
  triggerRight: number,
  menuWidth: number,
  viewportWidth: number,
) {
  const preferred =
    triggerLeft + menuWidth > viewportWidth - EDGE_MARGIN
      ? triggerRight - menuWidth
      : triggerLeft;
  return Math.max(
    EDGE_MARGIN,
    Math.min(preferred, viewportWidth - menuWidth - EDGE_MARGIN),
  );
}
