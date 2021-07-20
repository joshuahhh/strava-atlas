import './ViewerMap.css';

import m, { VnodeDOM } from 'mithril';
import Stream from 'mithril/stream';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.locatecontrol';

// fontawesome stuff is needed by L.Control.Locate; pretty big! :(
import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
import 'leaflet.locatecontrol/dist/L.Control.Locate.css';

import { Act } from '../Act';
import pathsLayer from '../pathsLayer';



interface ViewerMapAttrs {
  visibleActs$: Stream<Act[]>,
  hoveredActIds$: Stream<number[]>,
  multiselectedActIds$: Stream<number[]>,
  selectedActId$: Stream<number | undefined>,
}
const ViewerMap: m.ClosureComponent<ViewerMapAttrs> = ({attrs: {visibleActs$, selectedActId$, multiselectedActIds$, hoveredActIds$}}) => {
  function oncreate({dom}: VnodeDOM) {
    const map = L.map(dom as HTMLElement, { renderer: L.canvas() });

    L.control.locate({ drawCircle: false }).addTo(map);  // HACK: drawCircle is disabled because it blocks other mouse events


    // ******
    // LAYERS
    // ******

    const attribution = '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/about-carto/">CARTO</a>';
    const ext = L.Browser.retina ? '@2x.png' : '.png';

    // zIndex values are set relative to the (PIXI) pathsLayer at zIndex 0 and the markers layer at zIndex 600.

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}' + ext, {
      zIndex: -100, pane: 'mapPane', attribution,
    }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}' + ext, {
      zIndex: 700, pane: 'mapPane', attribution,
    }).addTo(map);

    pathsLayer({visibleActs$, selectedActId$, hoveredActIds$}).addTo(map);


    // *******
    // MARKERS
    // *******

    const startMarker = L.marker([0, 0], {
      opacity: 0, interactive: false,
      icon: L.divIcon({
        className: 'ViewerMap-marker-start',
        iconSize: [12, 12],
      }),
      zIndexOffset: 20000,  // needs to be large to overcome latitude-based zIndex
    }).addTo(map);
    const endMarker = L.marker([0, 0], {
      opacity: 0, interactive: false,
      icon: L.divIcon({
        className: 'ViewerMap-marker-end',
        html: '<div class="ViewerMap-marker-end-child"/>',
        iconSize: [12, 12],
      }),
      zIndexOffset: 10000,
    }).addTo(map);

    selectedActId$.map((selectedActId) => {
      const selectedAct = visibleActs$().find((act) => act.data.id === selectedActId);
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
    });


    // ************
    // INTERACTIONS
    // ************

    const tooltip = L.tooltip();

    let panOrZoomInProgress = false;
    map.on('movestart', () => { panOrZoomInProgress = true; });
    map.on('moveend', () => { panOrZoomInProgress = false; });
    map.on('zoomstart', () => { panOrZoomInProgress = true; });
    map.on('zoomend', () => { panOrZoomInProgress = false; });

    map.on('mousemove', (ev: L.LeafletMouseEvent) => {
      if (panOrZoomInProgress) { return; }

      const projectedPt = map.getPixelOrigin().add(ev.layerPoint);

      // Determine the hovered acts
      const hoveredActs = visibleActs$().filter((act) =>
        // act.targetPolyline && (act.targetPolyline as any)._containsPoint(ev.layerPoint)
        act.containsProjectedPoint(projectedPt, 7, map.getZoom())
      );
      hoveredActIds$(hoveredActs.map((act) => act.data.id));

      // Manage the tooltip
      if (hoveredActs.length === 0) {
        map.closeTooltip(tooltip);
      } else {
        const listedActs = hoveredActs.slice(0, 2);
        const numUnlistedActs = hoveredActs.length - 2;
        const tooltipContent = listedActs
           .map((act) => `${act.data.name} (${act.startDate.toLocaleDateString()})`)
           .join("<br/>")
           + (numUnlistedActs > 0 ? `<br/>… and ${numUnlistedActs} more` : '');
        tooltip.setContent(tooltipContent);
        tooltip.setLatLng(ev.latlng);
        map.openTooltip(tooltip);
      }

      // TODO: Set cursor
    });

    // Deselect selected activity when background is clicked
    map.on('click', () => {
      const hoveredActIds = hoveredActIds$();
      if (hoveredActIds.length === 0) {
        if (selectedActId$()) {
          selectedActId$(undefined);
        } else if (multiselectedActIds$().length > 0) {
          multiselectedActIds$([]);
        }
      } else if (hoveredActIds.length === 1) {
        selectedActId$(visibleActs$().find((act) => act.data.id === hoveredActIds[0])?.data.id);
      } else {
        multiselectedActIds$(hoveredActIds);
      }
      m.redraw();
    });

    // Fly to an activity if it is selected
    selectedActId$.map((selectedActId) => {
      const selectedAct = visibleActs$().find((act) => act.data.id === selectedActId);
      if (selectedAct) {
        // fly to activity in map
        if (selectedAct.latLngs) {
          map.fitBounds(selectedAct.latLngs);
        }
      }
    });

    // Update URL from map view
    map.on('moveend', () => {
      const center = map.getCenter();
      const hash = `#@${center.lat.toFixed(7)},${center.lng.toFixed(7)},${map.getZoom().toFixed(2)}z`;
      window.history.replaceState(null, '', hash);
    });

    // One-time: set map view from URL or appropriate bounds
    if (window.location.hash !== '') {
      const numPat = "-?[0-9.]+";
      const match = window.location.hash.match(`^#@(${numPat}),(${numPat}),(${numPat})z$`);
      if (match) {
        map.setView({lat: +match[1], lng: +match[2]}, +match[3]);
      }
    } else {
      let bounds: L.LatLngBounds | undefined;
      visibleActs$().forEach((act) => {
        if (!act.latLngs) { return; }
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
  }

  return {
    view: () => {
      return m('.ViewerMap', {oncreate});
    },
  };
};
export default ViewerMap;