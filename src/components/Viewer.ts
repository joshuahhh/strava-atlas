import './Viewer.css';

import m from 'mithril';
import Stream from 'mithril/stream';
import _ from 'lodash';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as PIXI from 'pixi.js';
import 'leaflet-pixi-overlay';
import 'leaflet.locatecontrol';

// Needed by L.Control.Locate; pretty big
import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
import 'leaflet.locatecontrol/dist/L.Control.Locate.css';

import ViewerTable from './ViewerTable';
import { StravaSummaryActivity } from '../stravaApi';
import { Act } from '../Act';
import { LeafletPixiOverlay } from 'leaflet-pixi-overlay';
import { toggle } from '../shared';

// const tuple = <T extends unknown[]>(...args: T) => args;

PIXI.utils.skipHello();

const colorMapFrag = `
varying vec2 vTextureCoord;

uniform sampler2D uSampler;
uniform float eachActAlpha;

vec4 colormap(float x) {
  float r = clamp(8.0 / 3.0 * x, 0.0, 1.0);
  float g = clamp(8.0 / 3.0 * x - 1.0, 0.0, 1.0);
  float b = clamp(max(4.0 * x - 3.0, 1.0 - 4.0 / 3.0 * x), 0.0, 1.0);
  return vec4(r, g, b, 1.0);
}

void main(void){
  // Remember: input & output are premultiplied!
  vec4 orig = texture2D(uSampler, vTextureCoord);
  float newAlpha = clamp(orig.w / eachActAlpha, 0.0, 1.0);
  float val = orig.w - eachActAlpha;
  if (eachActAlpha < 1.0) {
    val = val / (1.0 - eachActAlpha);
  }
  gl_FragColor = colormap(val * 0.75) * newAlpha;
}
`;


function drawActivity (gs: PIXI.Graphics, act: Act) {
  const projectedPoints = act.projectedPoints;
  if (projectedPoints) {
    projectedPoints.forEach((coords, i) => {
      if (i === 0) {
        gs.moveTo(coords.x, coords.y);
      } else {
        gs.lineTo(coords.x, coords.y);
      }
    });
  }
}


function drawHighlight (gs: PIXI.Graphics, act: Act, scale: number, alpha: number) {
  gs.lineTextureStyle({width: 9 / scale, color: 0x000000, join: PIXI.LINE_JOIN.ROUND, cap: PIXI.LINE_CAP.ROUND, alignment: 0.5, alpha});
  drawActivity(gs, act);
  gs.lineTextureStyle({width: 2 / scale, color: 0x00EE00, join: PIXI.LINE_JOIN.ROUND, cap: PIXI.LINE_CAP.ROUND, alignment: 0.5, alpha});
  drawActivity(gs, act);
}

const targetsRenderer = L.canvas();

interface ViewerAttrs {
  actData$: Stream<StravaSummaryActivity[]>,
  actDataSync$: Stream<StravaSummaryActivity[] | undefined>,
  syncDate$: Stream<number>,
  sync: () => void,
}
const Viewer: m.ClosureComponent<ViewerAttrs> = (vnode) => {
  const { actData$, actDataSync$, syncDate$, sync } = vnode.attrs;
  const acts$ = actData$.map((actData) =>
    _.chain(actData)
      .map((data) => new Act(data))
      .orderBy(['data.start_date'], ['desc'])
      .value()
  );
  acts$.map(() => {
    m.redraw();
  });

  function actById(actId: number) { return _.find(acts$(), (act) => act.data.id === actId); }

  // Here are the layers of the map (all inside map-pane):
  //   overlay-pane
  //     targets
  //   lower tiles
  //   pathsLayer (a PIXI overlay)
  //     allActs [filter: colorMap, allActsAlpha]
  //       {bgGraphics for each act} [filter: eachActAlpha]
  //     highlight
  //   upper tiles

  let map: L.Map;
  let pathsLayer: LeafletPixiOverlay;
  let allActPaths = new PIXI.Container();
  let satActCount = 5;
  const eachActAlpha = new PIXI.filters.AlphaFilter(1 / satActCount);
  acts$.map((acts) => {
    allActPaths.removeChildren();
    acts.forEach((act) => {
      if (act.bgGraphics) {
        act.bgGraphics.filters = [ eachActAlpha ];
        allActPaths.addChild(act.bgGraphics);
      }
    });
  });

  const pixiContainer = new PIXI.Container();
  const hoveredActPath = new PIXI.Graphics();
  const selectedActPath = new PIXI.Graphics();
  pixiContainer.addChild(allActPaths);
  pixiContainer.addChild(hoveredActPath);
  pixiContainer.addChild(selectedActPath);

  const colorMap = new PIXI.Filter(undefined, colorMapFrag);
  colorMap.uniforms.eachActAlpha = 1 / satActCount;
  const allActsAlpha = new PIXI.filters.AlphaFilter(1);
  allActPaths.filters = [ colorMap, allActsAlpha ];

  const hoveredActId$ = Stream<number | undefined>(undefined);
  const selectedActId$ = Stream<number | undefined>(undefined);

  hoveredActId$.map(() => m.redraw());
  selectedActId$.map(() => m.redraw());

  selectedActId$.map((selectedActId) => {
    const selectedAct = selectedActId !== undefined ? actById(selectedActId) : undefined;
    allActsAlpha.alpha = selectedAct ? 0.5 : 1;
    if (selectedAct) {
      // fly to activity in map
      let polyline = selectedAct.targetPolyline;
      if (polyline) {
        map.fitBounds(polyline.getBounds());
      }
    }
  });

  let makeMap = (container: HTMLElement) => {
    map = L.map(container, { renderer: L.canvas() });
    // HACK: drawCircle is disabled because it blocks other mouse events
    L.control.locate({ drawCircle: false }).addTo(map);

    // Deselect selected activity when background is clicked
    map.on('click', () => {
      selectedActId$(undefined);
    });

    // zIndex values are set relative to the (PIXI) pathsLayer at zIndex 0.
    const attribution = '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/about-carto/">CARTO</a>';
    const ext = L.Browser.retina ? '@2x.png' : '.png';
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}' + ext, {
        zIndex: -100, pane: 'mapPane', attribution,
    }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}' + ext, {
        zIndex: 100, pane: 'mapPane', attribution,
    }).addTo(map);


    // The pathsLayer draw function has different parts which depend on different streams.
    // This is some machinery to run these reactively.

    let scheduledRedrawPathsLayer = false;
    function scheduleRedrawPathsLayer() {
      if (scheduledRedrawPathsLayer) { return; }
      scheduledRedrawPathsLayer = true;
      requestAnimationFrame(() => {
        pathsLayer.redraw();
        scheduledRedrawPathsLayer = false;
      });
    }

    let actsChanged = true;
    acts$.map(() => { actsChanged = true; scheduleRedrawPathsLayer(); });

    let hoveredActIdChanged = true;
    hoveredActId$.map(() => { hoveredActIdChanged = true; scheduleRedrawPathsLayer(); });

    let selectedActIdChanged = true;
    selectedActId$.map(() => { selectedActIdChanged = true; scheduleRedrawPathsLayer(); });

    let prevZoom: number | undefined = undefined;
    pathsLayer = L.pixiOverlay((utils) => {
      const zoom = utils.getMap().getZoom();
      const renderer = utils.getRenderer();
      const project = utils.latLngToLayerPoint;
      const scale = utils.getScale();

      const zoomChanged = prevZoom !== zoom;

      if (actsChanged) {
        acts$().forEach((act) => act.applyProjection(project));
      }

      if (actsChanged || zoomChanged) {
        acts$().forEach((act) => {
          if (act.bgGraphics) {
            act.bgGraphics.clear();
            act.bgGraphics.lineTextureStyle({width: 4 / scale, color: 0xFF0000, alpha: 1, join: PIXI.LINE_JOIN.BEVEL, alignment: 0.5});
            drawActivity(act.bgGraphics, act);
          }
        });
      }

      if (hoveredActIdChanged || zoomChanged) {
        hoveredActPath.clear();
        const hoveredActId = hoveredActId$();
        const hoveredAct = hoveredActId && actById(hoveredActId);
        if (hoveredAct)  {
          drawHighlight(hoveredActPath, hoveredAct, scale, 0.5);
        }
      }

      if (selectedActIdChanged || zoomChanged) {
        selectedActPath.clear();
        const selectedActId = selectedActId$();
        const selectedAct = selectedActId && actById(selectedActId);
        if (selectedAct)  {
          drawHighlight(selectedActPath, selectedAct, scale, 1);
        }
      }

      actsChanged = false;
      hoveredActIdChanged = false;
      selectedActIdChanged = false;
      prevZoom = zoom;

      renderer.render(pixiContainer);
    }, pixiContainer, {pane: 'mapPane'}).addTo(map);

    // Targets are not drawn, but we use them to detect mouse events on activities
    const targets = L.layerGroup().addTo(map);
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

    // Update URL from map view
    map.on('moveend', () => {
      const center = map.getCenter();
      const hash = `#@${center.lat.toFixed(7)},${center.lng.toFixed(7)},${map.getZoom().toFixed(2)}z`;
      window.history.replaceState(null, '', hash);
    });


    // Set map view: either from URL, or from appropriate bounds
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

    m.redraw();
  };

  return {
    view: () => {
      return [
        m('.Viewer', [
          m('.Viewer-left',
            m('.Viewer-map', {oncreate: (vnode) => makeMap(vnode.dom as HTMLElement)})
          ),
          m('.Viewer-right', [
            m(ViewerTable, {acts$, hoveredActId$, selectedActId$}),
            m('.Viewer-controls',
              m('',
                "You are using ", m('span.Viewer-strava-atlas', "Strava Atlas"), ". ",
                "View source ", m('a', {href: 'https://github.com/joshuahhh/strava-atlas'}, 'on GitHub'), ".",
              ),
              m('',
                actDataSync$()
                ? [
                    'Sync in progress: ',
                    m('span.Viewer-loading-progress.Shared-loading-progress', `${actDataSync$()!.length} activities`),
                  ]
                : [
                    `Last synced at ${new Date(syncDate$()).toLocaleString()}. `,
                    m('button', { onclick: sync }, 'Sync now'),
                  ]
              )
            ),
          ]),
        ]),
      ];
    },
  };
};
export default Viewer;
