import { MapboxOverlay } from "@deck.gl/mapbox";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Act,
  latLngToMerc,
  latLngsToFlatLngLat,
  lngLatPathToMerc,
  mercBoundsOf,
  polylineContainsMercatorPoint,
  polylinePassesNear,
  type LngLatPath,
} from "../Act";
import { StravaPathsLayer } from "../pathsLayer";
import { StravaStreamSet } from "../stravaApi";

import "./ViewerMap.css";

const STYLE_URL =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// Most passes shown in the selected-ride stats section of the tooltip.
const MAX_TOOLTIP_PASSES = 4;

interface ViewerMapProps {
  visibleActs: Act[];
  hoveredActIds: number[];
  setHoveredActIds: (ids: number[]) => void;
  multiselectedActIds: number[];
  setMultiselectedActIds: (ids: number[]) => void;
  selectedActId: number | undefined;
  setSelectedActId: (id: number | undefined) => void;
  selectedActStreams: StravaStreamSet | undefined;
}

export function ViewerMap({
  visibleActs,
  hoveredActIds,
  setHoveredActIds,
  multiselectedActIds,
  setMultiselectedActIds,
  selectedActId,
  setSelectedActId,
  selectedActStreams,
}: ViewerMapProps) {
  // Refs that mirror the latest props so map handlers (created once) read the current values.
  const visibleActsRef = useRef(visibleActs);
  visibleActsRef.current = visibleActs;
  const multiselectedActIdsRef = useRef(multiselectedActIds);
  multiselectedActIdsRef.current = multiselectedActIds;
  const selectedActIdRef = useRef(selectedActId);
  selectedActIdRef.current = selectedActId;

  // Full-resolution track for the selected activity, derived from its
  // streams: mercator points for nearest-point lookup on hover, and a flat
  // [lng, lat, ...] path for rendering.
  const streamTrack = useMemo(() => {
    const latlng = selectedActStreams?.latlng?.data;
    if (!latlng || latlng.length === 0 || !selectedActStreams) return undefined;
    const pathLngLat = latLngsToFlatLngLat(latlng);
    const mercPoints = lngLatPathToMerc(pathLngLat);
    return {
      streams: selectedActStreams,
      mercPoints,
      mercBounds: mercBoundsOf(mercPoints),
      pathLngLat,
    };
  }, [selectedActStreams]);
  const streamTrackRef = useRef(streamTrack);
  streamTrackRef.current = streamTrack;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const beforeIdRef = useRef<string | undefined>(undefined);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // One-time map setup.
  useEffect(() => {
    const dom = containerRef.current;
    if (!dom) return;

    // Initial center/zoom from URL hash, else world.
    let initialCenter: [number, number] = [0, 0];
    let initialZoom = 1;
    let usedHash = false;
    if (window.location.hash !== "") {
      const numPat = "-?[0-9.]+";
      const match = window.location.hash.match(
        `^#@(${numPat}),(${numPat}),(${numPat})z$`,
      );
      if (match) {
        initialCenter = [+match[2], +match[1]]; // lng, lat
        initialZoom = +match[3];
        usedHash = true;
      }
    }

    const map = new maplibregl.Map({
      container: dom,
      style: STYLE_URL,
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: { compact: true },
      pitchWithRotate: false,
      dragRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-left",
    );

    // Markers (start/end of selected activity). Created hidden; a separate
    // effect updates their position and visibility on selection changes.
    function makeMarker(className: string, child?: HTMLElement) {
      const el = document.createElement("div");
      el.className = className;
      if (child) el.appendChild(child);
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([0, 0])
        .addTo(map);
      el.style.display = "none";
      return marker;
    }
    startMarkerRef.current = makeMarker("ViewerMap-marker-start");
    const endChild = document.createElement("div");
    endChild.className = "ViewerMap-marker-end-child";
    endMarkerRef.current = makeMarker("ViewerMap-marker-end", endChild);

    // Hover tooltip rendered as a MapLibre Popup (no map interaction).
    const tooltipEl = document.createElement("div");
    tooltipEl.className = "ViewerMap-tooltip";
    const tooltip = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      closeOnMove: false,
      className: "ViewerMap-tooltip-popup",
    }).setDOMContent(tooltipEl);

    function projectMerc(lng: number, lat: number): [number, number] {
      return latLngToMerc([lat, lng]);
    }

    function hoveredAt(lng: number, lat: number, tolPx: number): Act[] {
      const [px, py] = projectMerc(lng, lat);
      const worldPx = 512 * Math.pow(2, map.getZoom());
      const tol = tolPx / worldPx;
      return visibleActsRef.current.filter((act) => {
        // The selected act displays its full-resolution track, so hit-test
        // against that (not the summary polyline) once it's loaded.
        const track = streamTrackRef.current;
        if (track && act.data.id === selectedActIdRef.current) {
          return polylineContainsMercatorPoint(
            track.mercPoints,
            track.mercBounds,
            px,
            py,
            tol,
          );
        }
        return act.containsMercatorPoint(px, py, tol);
      });
    }

    function refreshHoveredActIds(lng: number, lat: number): Act[] {
      const hits = hoveredAt(lng, lat, 7);
      setHoveredActIds(hits.map((a) => a.data.id));
      return hits;
    }

    map.on("mousemove", (ev) => {
      if (map.isMoving()) return;
      const hoveredActs = refreshHoveredActIds(ev.lngLat.lng, ev.lngLat.lat);

      if (hoveredActs.length === 0) {
        tooltip.remove();
        return;
      }

      const listed = hoveredActs.slice(0, 2);
      const numUnlisted = hoveredActs.length - 2;
      let html =
        listed
          .map(
            (act) =>
              `${escapeHtml(act.data.name)} (${act.startDate.toLocaleDateString()})`,
          )
          .join("<br/>") +
        (numUnlisted > 0 ? `<br/>… and ${numUnlisted} more` : "");

      // If the selected ride is among the hovered (and its streams are
      // loaded), append stats for each pass it makes near the cursor —
      // an out-and-back ride visits the same spot at multiple times.
      const selectedAct = hoveredActs.find(
        (a) => a.data.id === selectedActIdRef.current,
      );
      const track = streamTrackRef.current;
      if (selectedAct && track) {
        const [px, py] = projectMerc(ev.lngLat.lng, ev.lngLat.lat);
        const tol = 7 / (512 * Math.pow(2, map.getZoom()));
        const passes = polylinePassesNear(track.mercPoints, px, py, tol);
        const blocks = passes
          .slice(0, MAX_TOOLTIP_PASSES)
          .map((i) => pointDescriptionHtml(selectedAct, track.streams, i))
          .filter((block) => block !== "");
        if (blocks.length > 0) {
          const numUnlistedPasses = passes.length - MAX_TOOLTIP_PASSES;
          html +=
            `<div class="ViewerMap-tooltip-selected-stats">` +
            blocks.map((block) => `<div>${block}</div>`).join("") +
            (numUnlistedPasses > 0
              ? `<div>… and ${numUnlistedPasses} more times</div>`
              : "") +
            `</div>`;
        }
      }

      tooltipEl.innerHTML = html;
      tooltip.setLngLat(ev.lngLat).addTo(map);
    });

    map.on("movestart", () => tooltip.remove());

    map.on("click", (ev) => {
      const hits = refreshHoveredActIds(ev.lngLat.lng, ev.lngLat.lat);
      const hoveredIds = hits.map((a) => a.data.id);
      if (hoveredIds.length === 0) {
        if (selectedActIdRef.current !== undefined) {
          setSelectedActId(undefined);
        } else if (multiselectedActIdsRef.current.length > 0) {
          setMultiselectedActIds([]);
        }
      } else if (hoveredIds.length === 1) {
        setSelectedActId(hoveredIds[0]);
      } else {
        setMultiselectedActIds(hoveredIds);
      }
    });

    map.on("moveend", () => {
      const c = map.getCenter();
      const hash = `#@${c.lat.toFixed(7)},${c.lng.toFixed(7)},${map.getZoom().toFixed(2)}z`;
      window.history.replaceState(null, "", hash);
    });

    map.on("load", () => {
      // Find the first label layer at the start of the symbol-only tail.
      const style = map.getStyle();
      let labelTailStart = style.layers.length;
      for (let i = style.layers.length - 1; i >= 0; i--) {
        if (style.layers[i].type === "symbol") labelTailStart = i;
        else break;
      }
      beforeIdRef.current = style.layers[labelTailStart]?.id;

      // Add the deck.gl overlay (interleaved so labels stay on top).
      const overlay = new MapboxOverlay({
        interleaved: true,
        layers: [],
      });
      map.addControl(overlay);
      overlayRef.current = overlay;

      if (!usedHash) {
        const acts = visibleActsRef.current;
        const bounds = new maplibregl.LngLatBounds();
        let any = false;
        for (const act of acts) {
          if (!act.lngLats) continue;
          extendBounds(bounds, act.lngLats);
          any = any || act.lngLats.length > 0;
        }
        if (any) map.fitBounds(bounds, { padding: 32, animate: false });
      }

      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      beforeIdRef.current = undefined;
      startMarkerRef.current = null;
      endMarkerRef.current = null;
      setMapReady(false);
    };
  }, [setHoveredActIds, setMultiselectedActIds, setSelectedActId]);

  // Push a fresh layer set into the deck.gl overlay whenever data changes.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !mapReady) return;
    overlay.setProps({
      layers: [
        new StravaPathsLayer({
          id: "strava-paths",
          acts: visibleActs,
          hoveredIds: hoveredActIds,
          selectedId: selectedActId,
          selectedPath: streamTrack?.pathLngLat,
          beforeId: beforeIdRef.current,
        }),
      ],
    });
  }, [mapReady, visibleActs, hoveredActIds, selectedActId, streamTrack]);

  // React to selection changes: update markers + fly to.
  useEffect(() => {
    const startMarker = startMarkerRef.current;
    const endMarker = endMarkerRef.current;
    const map = mapRef.current;
    if (!startMarker || !endMarker || !map) return;

    const selectedAct = visibleActs.find(
      (act) => act.data.id === selectedActId,
    );
    const path = selectedAct?.lngLats;
    const hasPoints = !!path && path.length > 0;
    setMarkerVisible(startMarker, hasPoints);
    setMarkerVisible(endMarker, hasPoints);
    if (path && hasPoints) {
      const n = path.length;
      startMarker.setLngLat([path[0], path[1]]);
      endMarker.setLngLat([path[n - 2], path[n - 1]]);

      const bounds = new maplibregl.LngLatBounds();
      extendBounds(bounds, path);
      map.fitBounds(bounds, { padding: 64 });
    }
  }, [selectedActId, visibleActs]);

  return <div className="ViewerMap" ref={containerRef} />;
}

function setMarkerVisible(marker: maplibregl.Marker, visible: boolean) {
  marker.getElement().style.display = visible ? "" : "none";
}

function extendBounds(bounds: maplibregl.LngLatBounds, path: LngLatPath) {
  for (let i = 0; i < path.length; i += 2) {
    bounds.extend([path[i], path[i + 1]]);
  }
}

// Tooltip contents for one stream point: clock time + elapsed time, then
// whatever point stats the activity recorded. Returns "" if there's nothing
// to show (e.g. no time stream).
function pointDescriptionHtml(
  act: Act,
  streams: StravaStreamSet,
  i: number,
): string {
  const lines: string[] = [];

  const timeSec = streams.time?.data[i];
  if (timeSec !== undefined) {
    // start_date_local is the ride's wall time with a fake "Z", so adding
    // the offset and formatting in UTC yields the ride's local time.
    const t = new Date(
      new Date(act.data.start_date_local).getTime() + timeSec * 1000,
    );
    const clock = t.toLocaleTimeString([], {
      timeZone: "UTC",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
    lines.push(`${clock} (${formatElapsed(timeSec)} in)`);
  }

  const stats: string[] = [];
  const velocity = streams.velocity_smooth?.data[i];
  if (velocity !== undefined) {
    stats.push(`${(velocity * 2.23694).toFixed(1)} mph`);
  }
  const altitude = streams.altitude?.data[i];
  if (altitude !== undefined) {
    stats.push(`${Math.round(altitude * 3.28084)} ft`);
  }
  const grade = streams.grade_smooth?.data[i];
  if (grade !== undefined) {
    stats.push(`${grade.toFixed(1)}%`);
  }
  const heartrate = streams.heartrate?.data[i];
  if (heartrate !== undefined) {
    stats.push(`${Math.round(heartrate)} bpm`);
  }
  if (stats.length > 0) lines.push(stats.join(" · "));

  return lines.join("<br/>");
}

function formatElapsed(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
