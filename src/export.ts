import { toKML } from "@placemarkio/tokml";
import type * as GeoJSON from "geojson";

import { Act } from "./Act";

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function featureDesc(props: Record<string, unknown>): string {
  return Object.entries(props)
    .filter(([, v]) => typeof v !== "object")
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function geoJSONToGPX(fc: GeoJSON.FeatureCollection): string {
  const trks = fc.features
    .map((f) => {
      if (f.geometry.type !== "LineString") return "";
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const name = xmlEscape(String(props.name ?? props.id ?? ""));
      const desc = xmlEscape(featureDesc(props));
      const pts = f.geometry.coordinates
        .map(([lng, lat]) => `<trkpt lat="${lat}" lon="${lng}"/>`)
        .join("");
      return `<trk><name>${name}</name><desc>${desc}</desc><trkseg>${pts}</trkseg></trk>`;
    })
    .join("");
  return `<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd" version="1.1" creator="strava-atlas">${trks}</gpx>`;
}

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
  return geoJSONToGPX(actsToGeoJSON(acts));
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
