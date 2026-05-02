import L from "leaflet";
import { LocateControl } from "leaflet.locatecontrol";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

import { Act } from "../Act";
import { pathsLayer, type PathsLayerHandle } from "../pathsLayer";

import "leaflet.locatecontrol/dist/L.Control.Locate.css";

import "./ViewerMap.css";

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
  const hoveredActIdsRef = useRef(hoveredActIds);
  hoveredActIdsRef.current = hoveredActIds;
  const multiselectedActIdsRef = useRef(multiselectedActIds);
  multiselectedActIdsRef.current = multiselectedActIds;
  const selectedActIdRef = useRef(selectedActId);
  selectedActIdRef.current = selectedActId;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pathsLayerRef = useRef<PathsLayerHandle | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const endMarkerRef = useRef<L.Marker | null>(null);

  // One-time map setup.
  useEffect(() => {
    const dom = containerRef.current;
    if (!dom) return;

    const map = L.map(dom, { renderer: L.canvas() });
    mapRef.current = map;

    // HACK: drawCircle is disabled because it blocks other mouse events
    new LocateControl({ drawCircle: false }).addTo(map);

    // ******
    // LAYERS
    // ******

    const attribution =
      '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/about-carto/">CARTO</a>';
    const ext = L.Browser.retina ? "@2x.png" : ".png";

    // zIndex values:
    //  -100 - base map nolabels
    //     0 - pathsLayer (from PIXI)
    //   600 - markers (ViewerMap-marker-start & ViewerMap-marker-end)
    //   625 - base map only_labels
    //   650 - tooltips

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}" + ext,
      { zIndex: -100, pane: "mapPane", attribution },
    ).addTo(map);

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}" + ext,
      { zIndex: 625, pane: "mapPane", attribution },
    ).addTo(map);

    const pl = pathsLayer({
      visibleActsRef,
      hoveredActIdsRef,
      selectedActIdRef,
    });
    pl.layer.addTo(map);
    pathsLayerRef.current = pl;

    // *******
    // MARKERS
    // *******

    const startMarker = L.marker([0, 0], {
      opacity: 0,
      interactive: false,
      icon: L.divIcon({
        className: "ViewerMap-marker-start",
        iconSize: [12, 12],
      }),
      zIndexOffset: 20000, // needs to be large to overcome latitude-based zIndex
    }).addTo(map);
    const endMarker = L.marker([0, 0], {
      opacity: 0,
      interactive: false,
      icon: L.divIcon({
        className: "ViewerMap-marker-end",
        html: '<div class="ViewerMap-marker-end-child"/>',
        iconSize: [12, 12],
      }),
      zIndexOffset: 10000,
    }).addTo(map);
    startMarkerRef.current = startMarker;
    endMarkerRef.current = endMarker;

    // ************
    // INTERACTIONS
    // ************

    const tooltip = L.tooltip();

    let panOrZoomInProgress = false;
    map.on("movestart", () => {
      panOrZoomInProgress = true;
    });
    map.on("moveend", () => {
      panOrZoomInProgress = false;
    });
    map.on("zoomstart", () => {
      panOrZoomInProgress = true;
    });
    map.on("zoomend", () => {
      panOrZoomInProgress = false;
    });

    function refreshHoveredActIds(ev: L.LeafletMouseEvent) {
      const projectedPt = map.getPixelOrigin().add(ev.layerPoint);
      const hoveredActs = visibleActsRef.current.filter((act) =>
        act.containsProjectedPoint(projectedPt, 7, map.getZoom()),
      );
      setHoveredActIds(hoveredActs.map((act) => act.data.id));
      return hoveredActs;
    }

    map.on("mousemove", (ev) => {
      if (panOrZoomInProgress) return;

      const hoveredActs = refreshHoveredActIds(ev);

      if (hoveredActs.length === 0) {
        map.closeTooltip(tooltip);
      } else {
        const listedActs = hoveredActs.slice(0, 2);
        const numUnlistedActs = hoveredActs.length - 2;
        const tooltipContent =
          listedActs
            .map(
              (act) =>
                `${act.data.name} (${act.startDate.toLocaleDateString()})`,
            )
            .join("<br/>") +
          (numUnlistedActs > 0 ? `<br/>… and ${numUnlistedActs} more` : "");
        tooltip.setContent(tooltipContent);
        tooltip.setLatLng(ev.latlng);
        map.openTooltip(tooltip);
      }
    });

    // Deselect selected activity when background is clicked.
    map.on("click", (ev) => {
      const hoveredIds = refreshHoveredActIds(ev).map((act) => act.data.id);
      if (hoveredIds.length === 0) {
        if (selectedActIdRef.current !== undefined) {
          setSelectedActId(undefined);
        } else if (multiselectedActIdsRef.current.length > 0) {
          setMultiselectedActIds([]);
        }
      } else if (hoveredIds.length === 1) {
        const found = visibleActsRef.current.find(
          (act) => act.data.id === hoveredIds[0],
        );
        setSelectedActId(found?.data.id);
      } else {
        setMultiselectedActIds(hoveredIds);
      }
    });

    // Update URL from map view.
    map.on("moveend", () => {
      const center = map.getCenter();
      const hash = `#@${center.lat.toFixed(7)},${center.lng.toFixed(7)},${map.getZoom().toFixed(2)}z`;
      window.history.replaceState(null, "", hash);
    });

    // One-time: set map view from URL or appropriate bounds.
    if (window.location.hash !== "") {
      const numPat = "-?[0-9.]+";
      const match = window.location.hash.match(
        `^#@(${numPat}),(${numPat}),(${numPat})z$`,
      );
      if (match) {
        map.setView({ lat: +match[1], lng: +match[2] }, +match[3]);
      }
    } else {
      let bounds: L.LatLngBounds | undefined;
      visibleActsRef.current.forEach((act) => {
        if (!act.latLngs) return;
        if (bounds) {
          bounds.extend(act.latLngs);
        } else {
          bounds = L.latLngBounds(act.latLngs);
        }
      });
      if (bounds) {
        map.fitBounds(bounds);
      } else {
        map.fitWorld();
      }
    }

    return () => {
      map.remove();
      mapRef.current = null;
      pathsLayerRef.current = null;
      startMarkerRef.current = null;
      endMarkerRef.current = null;
    };
  }, [setHoveredActIds, setMultiselectedActIds, setSelectedActId]);

  // React to selection changes: update markers + fly to.
  useEffect(() => {
    const startMarker = startMarkerRef.current;
    const endMarker = endMarkerRef.current;
    const map = mapRef.current;
    if (!startMarker || !endMarker || !map) return;

    const selectedAct = visibleActs.find(
      (act) => act.data.id === selectedActId,
    );
    if (selectedAct && selectedAct.data.start_latlng) {
      startMarker.setLatLng(selectedAct.data.start_latlng);
      startMarker.setOpacity(1);
    } else {
      startMarker.setOpacity(0);
    }
    if (selectedAct && selectedAct.data.end_latlng) {
      endMarker.setLatLng(selectedAct.data.end_latlng);
      endMarker.setOpacity(1);
    } else {
      endMarker.setOpacity(0);
    }

    if (selectedAct && selectedAct.latLngs) {
      map.fitBounds(selectedAct.latLngs);
    }
  }, [selectedActId, visibleActs]);

  // Notify pathsLayer of state changes.
  useEffect(() => {
    pathsLayerRef.current?.notify("acts");
  }, [visibleActs]);
  useEffect(() => {
    pathsLayerRef.current?.notify("hovered");
  }, [hoveredActIds]);
  useEffect(() => {
    pathsLayerRef.current?.notify("selected");
  }, [selectedActId]);

  return <div className="ViewerMap" ref={containerRef} />;
}
