import { describe, expect, it } from "vitest";
import { lookFromPointer, lookTransform } from "../mascotLook";

const rect = { left: 100, top: 200, width: 90, height: 60 };

describe("lookFromPointer", () => {
  it("looks straight ahead at the centre", () => {
    expect(lookFromPointer(rect, 145, 230)).toEqual({ x: 0, y: 0 });
  });

  it("turns toward the pointer", () => {
    const right = lookFromPointer(rect, 300, 230);
    expect(right.x).toBeGreaterThan(0.3);
    expect(right.y).toBe(0);

    const up = lookFromPointer(rect, 145, 120);
    expect(up.y).toBeLessThan(-0.3);
  });

  it("clamps when the pointer is far away", () => {
    expect(lookFromPointer(rect, 4000, -4000)).toEqual({ x: 1, y: -1 });
    expect(lookFromPointer(rect, -4000, 4000)).toEqual({ x: -1, y: 1 });
  });

  it("ignores a box with no size", () => {
    expect(
      lookFromPointer({ left: 0, top: 0, width: 0, height: 0 }, 50, 50),
    ).toEqual({ x: 0, y: 0 });
  });

  it("ignores broken coordinates", () => {
    expect(lookFromPointer(rect, Number.NaN, 230)).toEqual({ x: 0, y: 0 });
    expect(lookFromPointer(rect, 145, Number.POSITIVE_INFINITY)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("lookTransform", () => {
  it("is neutral at rest", () => {
    expect(lookTransform({ x: 0, y: 0 })).toBe(
      "perspective(30rem) rotateY(0deg) rotateX(0deg) translate3d(0px, 0px, 0)",
    );
  });

  it("keeps the turn small", () => {
    expect(lookTransform({ x: 1, y: 1 })).toBe(
      "perspective(30rem) rotateY(7deg) rotateX(-5deg) translate3d(2px, 1.5px, 0)",
    );
    expect(lookTransform({ x: -1, y: -1 })).toBe(
      "perspective(30rem) rotateY(-7deg) rotateX(5deg) translate3d(-2px, -1.5px, 0)",
    );
  });
});
