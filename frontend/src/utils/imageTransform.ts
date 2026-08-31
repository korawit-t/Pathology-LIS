/**
 * Pure geometry for the image editor's rotate / flip / crop pipeline.
 *
 * Konva maps a node's local point `p` to `position + R(rotation) · S · p`
 * (see Node._getTransform: translate → rotate → skew → scale → offset), and a
 * canvas 2D context built with translate → rotate → scale composes the same
 * way. So one layout calculation drives the on-screen stage, the natural-
 * resolution export, and the bake-to-canvas step alike.
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface Layout {
  /** Bounding-box size of the transformed image. */
  width: number;
  height: number;
  /** Translation that keeps the transformed image flush against (0, 0). */
  x: number;
  y: number;
  /** Signed scale — negative on an axis means that axis is flipped. */
  scaleX: number;
  scaleY: number;
}

/**
 * Where the image lands once rotation, flip and a fit-scale are applied:
 * transform the four corners, then take the bounding box.
 */
export function computeLayout(
  naturalWidth: number,
  naturalHeight: number,
  scale: number,
  rotation: Rotation,
  flipH: boolean,
  flipV: boolean,
): Layout {
  const rad = (rotation * Math.PI) / 180;
  // rotation is always a multiple of 90°, so round away float noise and keep
  // the transform exact (Math.cos(Math.PI / 2) is 6.1e-17, not 0).
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));
  const scaleX = (flipH ? -1 : 1) * scale;
  const scaleY = (flipV ? -1 : 1) * scale;

  const corners = [
    [0, 0],
    [naturalWidth, 0],
    [naturalWidth, naturalHeight],
    [0, naturalHeight],
  ].map(([px, py]) => {
    const ax = px * scaleX;
    const ay = py * scaleY;
    return { x: ax * cos - ay * sin, y: ax * sin + ay * cos };
  });

  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  return {
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
    // `+ 0` normalises -0 (which negating a 0 minimum produces) back to 0, so
    // callers comparing or serialising the layout don't have to care.
    x: -minX + 0,
    y: -minY + 0,
    scaleX,
    scaleY,
  };
}

/**
 * Map a flat [x0, y0, x1, y1, ...] list through a layout's transform, so
 * annotations follow the image when a rotation or flip is baked in.
 */
export function transformPoints(
  points: number[],
  layout: Layout,
  rotation: Rotation,
): number[] {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const ax = points[i] * layout.scaleX;
    const ay = points[i + 1] * layout.scaleY;
    out.push(layout.x + ax * cos - ay * sin, layout.y + ax * sin + ay * cos);
  }
  return out;
}

/** Axis-aligned bounds of a flat point list. */
export function shapeBounds(points: number[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    xs.push(points[i]);
    ys.push(points[i + 1]);
  }
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** Translate a point list into a crop's frame (crop origin becomes 0, 0). */
export function translatePoints(points: number[], dx: number, dy: number): number[] {
  return points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy));
}

/** True when any part of the shape still falls inside a `width` × `height` box. */
export function intersectsBox(points: number[], width: number, height: number): boolean {
  const b = shapeBounds(points);
  return b.maxX >= 0 && b.minX <= width && b.maxY >= 0 && b.minY <= height;
}
