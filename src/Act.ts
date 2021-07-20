import _ from 'lodash';
import mbPolyline from '@mapbox/polyline';
import * as PIXI from 'pixi.js';
import L from 'leaflet';

import { StravaSummaryActivity } from './stravaApi';


type GetScale = (zoom: number | undefined) => number;

export class Act {
  startDate: Date;
  latLngs: [number, number][] | undefined;

  path: PIXI.Graphics | undefined;
  tableRow: HTMLElement | undefined;

  // the latLngs get projected at a particular initial zoom level
  // so these are in "initial-zoom pixels"
  projPoints: L.Point[] | undefined;
  projBounds: L.Bounds | undefined;
  getScaleFromProj: GetScale | undefined;


  constructor(public data: StravaSummaryActivity) {
    this.startDate = new Date(data.start_date);

    const polyline = data.map.summary_polyline;
    if (polyline) {
      let latLngs = mbPolyline.decode(polyline) as [number, number][];  // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/48644

      // filter jaggies
      const dist1 = _.range(latLngs.length - 1).map(i => Math.hypot(latLngs[i][0] - latLngs[i+1][0], latLngs[i][1] - latLngs[i+1][1]));
      const dist2 = _.range(latLngs.length - 2).map(i => Math.hypot(latLngs[i][0] - latLngs[i+2][0], latLngs[i][1] - latLngs[i+2][1]));
      for (let i = latLngs.length - 2; i >= 1; i--) {
        const AB = dist1[i - 1];
        const BC = dist1[i];
        const AC = dist2[i - 1];
        const excursion = AB + BC / 2;
        if (AC < 0.3 * excursion) {
          latLngs.splice(i, 1);
        }
      }

      this.latLngs = latLngs;
    }
  }

  applyProjection(project: (latlng: [number, number]) => L.Point, getScaleFromProjected: (zoom: number | undefined) => number): void {
    this.getScaleFromProj = getScaleFromProjected;
    this.projPoints = this.latLngs?.map((pt) => project(pt));

    if (this.projPoints && this.projPoints.length > 0) {
      this.projBounds = L.bounds(this.projPoints);
    }
  }

  // adapted from Leaflet/src/layer/vector/Polyline.js
  // p & tolerance are in in 'scale' pixels, unlike this.projX – you need to use this.getScaleFromProj(zoom)
  containsProjectedPoint(p: L.Point, tol: number, zoom: number): boolean {
    if (!this.projPoints || !this.projBounds || !this.getScaleFromProj) {
      return false;
    }

    const scale = this.getScaleFromProj(zoom);

    // This point is in the same coordinates as this.projX
    const projP = p.divideBy(scale);
    const projTol = tol / scale;

    if (!padBounds(this.projBounds, projTol).contains(projP)) {
      return false;
    }

    // hit detection for polylines
    const projectedPoints = this.projPoints as L.Point[];  // they have xs & ys, which is enough for pointToSegmentDistance
    const l = projectedPoints.length - 1;
    for (let i = 0; i < l; i++) {
      if (L.LineUtil.pointToSegmentDistance(projP, projectedPoints[i], projectedPoints[i + 1]) <= projTol) {
        return true;
      }
    }
		return false;
	}
}

function padBounds(bounds: L.Bounds, padding: number) {
  return L.bounds(bounds.min!.subtract([padding, padding]), bounds.max!.add([padding, padding]));
}