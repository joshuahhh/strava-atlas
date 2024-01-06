import { toKML } from "@placemarkio/tokml";
import type * as GeoJSON from "geojson";
// @ts-ignore
import toGPX from "togpx";

import { Act } from "./Act";


function actToGeoJSONFeature(act: Act): GeoJSON.Feature | undefined {
  if (!act.latLngs) {
    return undefined;
  }
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: act.latLngs.map(([lat, lng]) => [lng, lat]),
    },
    properties: {
      id: act.data.id,
      name: act.data.name,
      type: act.data.type,
      startDate: act.startDate.toISOString(),
      distance: act.data.distance,
      movingTime: act.data.moving_time,
      totalElevationGain: act.data.total_elevation_gain,
    },
  };
}

export function actsToGeoJSON(acts: Act[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: compact(acts.map(actToGeoJSONFeature)),
  };
}

export function actsToGPX(acts: Act[]): string {
  return toGPX(actsToGeoJSON(acts));
}

export function actsToKML(acts: Act[]): string {
  return toKML(actsToGeoJSON(acts));
}

export function saveFile(contents: Blob, fileName: string): void {
  let dummyLink = document.createElement("a");
  dummyLink.href = URL.createObjectURL(contents);
  dummyLink.download = fileName;
  dummyLink.click();
  URL.revokeObjectURL(dummyLink.href);
}

function compact<T>(arr: (T | undefined)[]): T[] {
  return arr.filter((x) => x !== undefined) as T[];
}
