import './ViewerMap.css';

import m, { VnodeDOM } from 'mithril';
import Stream from 'mithril/stream';
import _ from 'lodash';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.locatecontrol';

// fontawesome stuff is needed by L.Control.Locate; pretty big! :(
import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
import 'leaflet.locatecontrol/dist/L.Control.Locate.css';

import { toggle } from '../shared';
import { Act } from '../Act';
import pathsLayer from '../pathsLayer';



interface ViewerMapAttrs {
  acts$: Stream<Act[]>,
  hoveredActId$: Stream<number | undefined>,
  selectedActId$: Stream<number | undefined>,
}
const ViewerMap: m.ClosureComponent<ViewerMapAttrs> = ({attrs: {acts$, selectedActId$, hoveredActId$}}) => {
  function oncreate({dom}: VnodeDOM) {
    const map = L.map(dom as HTMLElement, { renderer: L.canvas() });

    L.control.locate({ drawCircle: false }).addTo(map);  // HACK: drawCircle is disabled because it blocks other mouse events


    // ******
    // LAYERS
    // ******

    const attribution = '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/about-carto/">CARTO</a>';
    const ext = L.Browser.retina ? '@2x.png' : '.png';

    // zIndex values are set relative to the (PIXI) pathsLayer at zIndex 0.

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}' + ext, {
      zIndex: -100, pane: 'mapPane', attribution,
    }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}' + ext, {
      zIndex: 100, pane: 'mapPane', attribution,
    }).addTo(map);

    pathsLayer({acts$, selectedActId$, hoveredActId$}).addTo(map);

    // Targets are invisible, but we use them to detect mouse events on activities
    const targets = L.layerGroup().addTo(map);
    const targetsRenderer = L.canvas();
    acts$.map((acts) => {
      targets.clearLayers();
      acts.forEach((act) => {
        const latLngs = act.latLngs;
        if (latLngs) {
          act.targetPolyline =
            L.polyline(latLngs, {renderer: targetsRenderer, weight: 14, opacity: 0})
              .bindTooltip(`${act.data.name} (${act.startDate.toLocaleDateString()})`, {sticky: true})
              .on('mouseover', () => hoveredActId$(act.data.id))
              .on('mouseout', () => hoveredActId$(undefined))
              .on('click', (ev) => { toggle(selectedActId$, act.data.id); L.DomEvent.stop(ev); })
              .addTo(targets);
        }
      });
    });


    // ************
    // INTERACTIONS
    // ************

    // Deselect selected activity when background is clicked
    map.on('click', () => {
      selectedActId$(undefined);
    });

    // Fly to an activity if it is selected
    selectedActId$.map((selectedActId) => {
      const selectedAct = _.find(acts$(), (act) => act.data.id === selectedActId);
      if (selectedAct) {
        // fly to activity in map
        let polyline = selectedAct.targetPolyline;
        if (polyline) {
          map.fitBounds(polyline.getBounds());
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
      acts$().forEach((act) => {
        if (!act.targetPolyline) { return; }
        const actBounds = act.targetPolyline.getBounds();
        if (bounds) {
          bounds.extend(actBounds);
        } else {
          bounds = actBounds;
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