import _ from 'lodash';
import mbPolyline from '@mapbox/polyline';
import * as PIXI from 'pixi.js';

import { StravaSummaryActivity } from './stravaApi';


export class Act {
  startDate: Date;
  latLngs: [number, number][] | undefined;

  bgGraphics: PIXI.Graphics | undefined;
  targetPolyline: L.Polyline | undefined;
  tableRow: HTMLElement | undefined;
  projectedPoints: {x: number, y: number}[] | undefined;


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

      this.bgGraphics = new PIXI.Graphics();
    }
  }

  applyProjection(project: (latlng: [number, number]) => {x: number, y: number}): void {
    this.projectedPoints = this.latLngs?.map((pt) => project(pt));
  }
}
