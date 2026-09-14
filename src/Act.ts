import mbPolyline from "@mapbox/polyline";
import _ from "lodash";

import { StravaSummaryActivity } from "./stravaApi";

// Polylines are stored as flat, interleaved Float64Arrays rather than arrays
// of [x, y] pairs: one GC object per track instead of one per point. With
// ~500k points loaded, per-point arrays made every Firefox cycle collection
// walk millions of objects, stalling the page for seconds mid-pan.

/** Interleaved [lng, lat, lng, lat, ...] — deck.gl's flat XY format. */
export type LngLatPath = Float64Array;
/** Interleaved Web-Mercator unit coords [x, y, x, y, ...], each in [0, 1]. */
export type MercPath = Float64Array;

export class Act {
  startDate: Date;
  lngLats: LngLatPath | undefined;

  // Web-Mercator unit coordinates; precomputed once.
  mercPoints: MercPath | undefined;
  mercBounds: [number, number, number, number] | undefined; // [minX, minY, maxX, maxY]

  constructor(public data: StravaSummaryActivity) {
    this.startDate = new Date(data.start_date);

    const polyline = data.map?.summary_polyline;
    if (polyline) {
      const latLngs = mbPolyline.decode(polyline);

      if (latLngs.length > 2) {
        // filter jaggies
        const dist1 = _.range(latLngs.length - 1).map((i) =>
          Math.hypot(
            latLngs[i][0] - latLngs[i + 1][0],
            latLngs[i][1] - latLngs[i + 1][1],
          ),
        );
        const dist2 = _.range(latLngs.length - 2).map((i) =>
          Math.hypot(
            latLngs[i][0] - latLngs[i + 2][0],
            latLngs[i][1] - latLngs[i + 2][1],
          ),
        );
        for (let i = latLngs.length - 2; i >= 1; i--) {
          const AB = dist1[i - 1];
          const BC = dist1[i];
          const AC = dist2[i - 1];
          const excursion = AB + BC / 2;
          if (AC < 0.3 * excursion) {
            latLngs.splice(i, 1);
          }
        }
      }

      this.lngLats = latLngsToFlatLngLat(latLngs);
      this.mercPoints = lngLatPathToMerc(this.lngLats);
      if (this.mercPoints.length > 0) {
        this.mercBounds = mercBoundsOf(this.mercPoints);
      }
    }
  }

  // Hit-test in mercator space. `tol` is in mercator units.
  containsMercatorPoint(px: number, py: number, tol: number): boolean {
    if (!this.mercPoints || !this.mercBounds) return false;
    return polylineContainsMercatorPoint(
      this.mercPoints,
      this.mercBounds,
      px,
      py,
      tol,
    );
  }
}

/** Pack an array of [lat, lng] pairs into a flat [lng, lat, ...] path. */
export function latLngsToFlatLngLat(latLngs: [number, number][]): LngLatPath {
  const out = new Float64Array(latLngs.length * 2);
  for (let i = 0; i < latLngs.length; i++) {
    out[2 * i] = latLngs[i][1];
    out[2 * i + 1] = latLngs[i][0];
  }
  return out;
}

export function lngLatPathToMerc(path: LngLatPath): MercPath {
  const out = new Float64Array(path.length);
  for (let i = 0; i < path.length; i += 2) {
    const [x, y] = latLngToMerc([path[i + 1], path[i]]);
    out[i] = x;
    out[i + 1] = y;
  }
  return out;
}

export function mercBoundsOf(pts: MercPath): [number, number, number, number] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i];
    const y = pts[i + 1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

// Hit-test a polyline in mercator space. `tol` is in mercator units.
export function polylineContainsMercatorPoint(
  pts: MercPath,
  bounds: [number, number, number, number],
  px: number,
  py: number,
  tol: number,
): boolean {
  const [minX, minY, maxX, maxY] = bounds;
  if (
    px < minX - tol ||
    px > maxX + tol ||
    py < minY - tol ||
    py > maxY + tol
  ) {
    return false;
  }
  const tolSq = tol * tol;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    if (pointToSegmentDistSq(px, py, pts, i) <= tolSq) {
      return true;
    }
  }
  return false;
}

// Each time the polyline passes within `tol` of (px, py) — i.e. each maximal
// run of consecutive within-tol segments — yields the vertex index nearest
// the point during that pass. Indices are in path order.
export function polylinePassesNear(
  pts: MercPath,
  px: number,
  py: number,
  tol: number,
): number[] {
  const tolSq = tol * tol;
  const passes: number[] = [];
  let inPass = false;
  let bestSq = Infinity;
  let bestIdx = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const distSq = pointToSegmentDistSq(px, py, pts, i);
    const t = lastSegmentT;
    if (distSq <= tolSq) {
      if (!inPass) {
        inPass = true;
        bestSq = Infinity;
      }
      if (distSq < bestSq) {
        bestSq = distSq;
        bestIdx = t < 0.5 ? i / 2 : i / 2 + 1;
      }
    } else if (inPass) {
      passes.push(bestIdx);
      inPass = false;
    }
  }
  if (inPass) passes.push(bestIdx);
  return passes;
}

export function latLngToMerc([lat, lng]: [number, number]): [number, number] {
  const x = (lng + 180) / 360;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
  return [x, y];
}

// Parameter along the segment [0, 1] of the closest point found by the most
// recent pointToSegmentDistSq call. Kept out-of-band so the hot hit-test
// loop doesn't allocate a result object per segment.
let lastSegmentT = 0;

// Squared distance from (px, py) to the segment starting at flat index `i`
// of `pts` (i.e. from (pts[i], pts[i+1]) to (pts[i+2], pts[i+3])).
function pointToSegmentDistSq(
  px: number,
  py: number,
  pts: MercPath,
  i: number,
): number {
  const ax = pts[i];
  const ay = pts[i + 1];
  const dx = pts[i + 2] - ax;
  const dy = pts[i + 3] - ay;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  lastSegmentT = t;
  const ex = px - (ax + t * dx);
  const ey = py - (ay + t * dy);
  return ex * ex + ey * ey;
}
