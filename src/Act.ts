import mbPolyline from "@mapbox/polyline";
import _ from "lodash";

import { StravaSummaryActivity } from "./stravaApi";

export class Act {
  startDate: Date;
  latLngs: [number, number][] | undefined;

  // Web-Mercator unit coordinates ([0,1] × [0,1]); precomputed once.
  mercPoints: [number, number][] | undefined;
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

      this.latLngs = latLngs;
      this.mercPoints = latLngs.map(latLngToMerc);
      if (this.mercPoints.length > 0) {
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        for (const [x, y] of this.mercPoints) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
        this.mercBounds = [minX, minY, maxX, maxY];
      }
    }
  }

  // Hit-test in mercator space. `tol` is in mercator units.
  containsMercatorPoint(px: number, py: number, tol: number): boolean {
    if (!this.mercPoints || !this.mercBounds) return false;
    const [minX, minY, maxX, maxY] = this.mercBounds;
    if (
      px < minX - tol ||
      px > maxX + tol ||
      py < minY - tol ||
      py > maxY + tol
    ) {
      return false;
    }
    const tolSq = tol * tol;
    const pts = this.mercPoints;
    for (let i = 0; i < pts.length - 1; i++) {
      if (pointToSegmentDistanceSq(px, py, pts[i], pts[i + 1]) <= tolSq) {
        return true;
      }
    }
    return false;
  }
}

export function latLngToMerc([lat, lng]: [number, number]): [number, number] {
  const x = (lng + 180) / 360;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
  return [x, y];
}

function pointToSegmentDistanceSq(
  px: number,
  py: number,
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 0) {
    t = ((px - a[0]) * dx + (py - a[1]) * dy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  const cx = a[0] + t * dx;
  const cy = a[1] + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return ex * ex + ey * ey;
}
