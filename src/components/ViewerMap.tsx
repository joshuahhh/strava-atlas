import { MapboxOverlay } from "@deck.gl/mapbox";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

import { Act, latLngToMerc } from "../Act";
import { StravaPathsLayer } from "../pathsLayer";

import "./ViewerMap.css";

const STYLE_URL =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

interface ViewerMapProps {
  visibleActs: Act[];
  hoveredActIds: number[];
  setHoveredActIds: (ids: number[]) => void;
  multiselectedActIds: number[];
  setMultiselectedActIds: (ids: number[]) => void;
  selectedActId: number | undefined;
  setSelectedActId: (id: number | undefined) => void;
}

export function ViewerMap({
  visibleActs,
  hoveredActIds,
  setHoveredActIds,
  multiselectedActIds,
  setMultiselectedActIds,
  selectedActId,
  setSelectedActId,
}: ViewerMapProps) {
  // Refs that mirror the latest props so map handlers (created once) read the current values.
  const visibleActsRef = useRef(visibleActs);
  visibleActsRef.current = visibleActs;
  const multiselectedActIdsRef = useRef(multiselectedActIds);
  multiselectedActIdsRef.current = multiselectedActIds;
  const selectedActIdRef = useRef(selectedActId);
  selectedActIdRef.current = selectedActId;

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
      return visibleActsRef.current.filter((act) =>
        act.containsMercatorPoint(px, py, tol),
      );
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
      } else {
        const listed = hoveredActs.slice(0, 2);
        const numUnlisted = hoveredActs.length - 2;
        tooltipEl.innerHTML =
          listed
            .map(
              (act) =>
                `${escapeHtml(act.data.name)} (${act.startDate.toLocaleDateString()})`,
            )
            .join("<br/>") +
          (numUnlisted > 0 ? `<br/>… and ${numUnlisted} more` : "");
        tooltip.setLngLat(ev.lngLat).addTo(map);
      }
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
          if (!act.latLngs) continue;
          for (const [lat, lng] of act.latLngs) {
            bounds.extend([lng, lat]);
            any = true;
          }
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
          beforeId: beforeIdRef.current,
        }),
      ],
    });
  }, [mapReady, visibleActs, hoveredActIds, selectedActId]);

  // React to selection changes: update markers + fly to.
  useEffect(() => {
    const startMarker = startMarkerRef.current;
    const endMarker = endMarkerRef.current;
    const map = mapRef.current;
    if (!startMarker || !endMarker || !map) return;

    const selectedAct = visibleActs.find(
      (act) => act.data.id === selectedActId,
    );
    const firstPoint = selectedAct?.latLngs?.[0];
    const lastPoint = selectedAct?.latLngs?.[selectedAct.latLngs.length - 1];
    setMarkerVisible(startMarker, !!firstPoint);
    if (firstPoint) startMarker.setLngLat([firstPoint[1], firstPoint[0]]);
    setMarkerVisible(endMarker, !!lastPoint);
    if (lastPoint) endMarker.setLngLat([lastPoint[1], lastPoint[0]]);

    if (selectedAct?.latLngs && selectedAct.latLngs.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const [lat, lng] of selectedAct.latLngs) {
        bounds.extend([lng, lat]);
      }
      map.fitBounds(bounds, { padding: 64 });
    }
  }, [selectedActId, visibleActs]);

  return <div className="ViewerMap" ref={containerRef} />;
}

function setMarkerVisible(marker: maplibregl.Marker, visible: boolean) {
  marker.getElement().style.display = visible ? "" : "none";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
