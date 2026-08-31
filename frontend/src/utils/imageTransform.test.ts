import { describe, it, expect } from "vitest";
import {
  computeLayout,
  transformPoints,
  translatePoints,
  intersectsBox,
  shapeBounds,
  type Rotation,
} from "./imageTransform";

/** Apply a layout the same way Konva/canvas do: position + R · S · p. */
function apply(point: [number, number], rotation: Rotation, layout: ReturnType<typeof computeLayout>) {
  return transformPoints(point, layout, rotation);
}

const W = 100;
const H = 50;

describe("computeLayout", () => {
  it("is the identity at rotation 0 with no flip", () => {
    const l = computeLayout(W, H, 1, 0, false, false);
    expect(l).toEqual({ width: 100, height: 50, x: 0, y: 0, scaleX: 1, scaleY: 1 });
  });

  it("swaps width and height at 90 and 270", () => {
    for (const rotation of [90, 270] as Rotation[]) {
      const l = computeLayout(W, H, 1, rotation, false, false);
      expect(l.width).toBe(H);
      expect(l.height).toBe(W);
    }
  });

  it("keeps width and height at 180", () => {
    const l = computeLayout(W, H, 1, 180, false, false);
    expect(l.width).toBe(W);
    expect(l.height).toBe(H);
  });

  it("applies the fit scale to the bounding box", () => {
    const l = computeLayout(W, H, 0.5, 0, false, false);
    expect(l.width).toBe(50);
    expect(l.height).toBe(25);
  });

  it("uses exact integers at right angles rather than float noise", () => {
    // Math.cos(Math.PI / 2) is 6.1e-17, which would leak into every coord.
    const l = computeLayout(W, H, 1, 90, false, false);
    expect(Number.isInteger(l.width)).toBe(true);
    expect(Number.isInteger(l.x)).toBe(true);
    expect(l.height).toBe(100);
  });

  it("marks a flipped axis with a negative scale", () => {
    expect(computeLayout(W, H, 1, 0, true, false).scaleX).toBe(-1);
    expect(computeLayout(W, H, 1, 0, false, true).scaleY).toBe(-1);
  });

  it("keeps the transformed image flush against the origin for every combination", () => {
    // Whatever the rotation/flip, the four corners must land exactly inside
    // [0, width] x [0, height] — that is what makes the stage fit with no gap.
    for (const rotation of [0, 90, 180, 270] as Rotation[]) {
      for (const flipH of [false, true]) {
        for (const flipV of [false, true]) {
          const l = computeLayout(W, H, 1, rotation, flipH, flipV);
          const corners = transformPoints([0, 0, W, 0, W, H, 0, H], l, rotation);
          const b = shapeBounds(corners);
          const label = `rot=${rotation} flipH=${flipH} flipV=${flipV}`;
          expect(b.minX, label).toBeCloseTo(0);
          expect(b.minY, label).toBeCloseTo(0);
          expect(b.maxX, label).toBeCloseTo(l.width);
          expect(b.maxY, label).toBeCloseTo(l.height);
        }
      }
    }
  });
});

describe("transformPoints", () => {
  it("moves an annotation with the image under a 90° rotation", () => {
    const l = computeLayout(W, H, 1, 90, false, false);
    // Top-left of the image goes to the top-right after rotating right.
    expect(apply([0, 0], 90, l)).toEqual([H, 0]);
    // Bottom-right goes to the bottom-left.
    expect(apply([W, H], 90, l)).toEqual([0, W]);
  });

  it("mirrors x under a horizontal flip", () => {
    const l = computeLayout(W, H, 1, 0, true, false);
    expect(apply([0, 10], 0, l)).toEqual([W, 10]);
    expect(apply([W, 10], 0, l)).toEqual([0, 10]);
  });

  it("mirrors y under a vertical flip", () => {
    const l = computeLayout(W, H, 1, 0, false, true);
    expect(apply([10, 0], 0, l)).toEqual([10, H]);
    expect(apply([10, H], 0, l)).toEqual([10, 0]);
  });

  it("round-trips a point through four right-angle rotations", () => {
    let point: number[] = [30, 10];
    let w = W;
    let h = H;
    for (let i = 0; i < 4; i += 1) {
      const l = computeLayout(w, h, 1, 90, false, false);
      point = transformPoints(point, l, 90);
      [w, h] = [l.width, l.height];
    }
    expect(point).toEqual([30, 10]);
    expect([w, h]).toEqual([W, H]);
  });

  it("handles a multi-point freehand stroke", () => {
    const l = computeLayout(W, H, 1, 180, false, false);
    expect(transformPoints([0, 0, W, H], l, 180)).toEqual([W, H, 0, 0]);
  });
});

describe("crop helpers", () => {
  it("shifts annotations into the crop frame", () => {
    // A crop starting at (20, 5) makes that point the new origin.
    expect(translatePoints([20, 5, 30, 15], -20, -5)).toEqual([0, 0, 10, 10]);
  });

  it("keeps a shape that is still partly inside the crop", () => {
    expect(intersectsBox([-5, -5, 10, 10], 50, 50)).toBe(true);
  });

  it("drops a shape that falls entirely outside the crop", () => {
    expect(intersectsBox([60, 60, 70, 70], 50, 50)).toBe(false);
    expect(intersectsBox([-30, -30, -10, -10], 50, 50)).toBe(false);
  });

  it("keeps a shape touching the crop edge", () => {
    expect(intersectsBox([50, 50], 50, 50)).toBe(true);
  });
});
