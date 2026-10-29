export type LookVector = { x: number; y: number };

type Rect = { left: number; top: number; width: number; height: number };

export function lookFromPointer(
  rect: Rect,
  pointX: number,
  pointY: number,
): LookVector {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  if (!Number.isFinite(pointX) || !Number.isFinite(pointY))
    return { x: 0, y: 0 };

  const clamp = (value: number) => Math.max(-1, Math.min(1, value));

  return {
    x: clamp((pointX - (rect.left + rect.width / 2)) / (rect.width * 3)),
    y: clamp((pointY - (rect.top + rect.height / 2)) / (rect.height * 3)),
  };
}

export function lookTransform({ x, y }: LookVector): string {
  return `perspective(30rem) rotateY(${x * 7}deg) rotateX(${-y * 5}deg) translate3d(${x * 2}px, ${y * 1.5}px, 0)`;
}
