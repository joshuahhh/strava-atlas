import './Viewer.css';

import m from 'mithril';
import Stream from 'mithril/stream';
import _ from 'lodash';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as PIXI from 'pixi.js';
import 'leaflet-pixi-overlay';
import 'leaflet.locatecontrol';
import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
import 'leaflet.locatecontrol/dist/L.Control.Locate.css';

import ActivityRow from './ActivityRow';
import { StravaSummaryActivity } from '../stravaApi';
import { Act } from '../Act';
import { LeafletPixiOverlay } from 'leaflet-pixi-overlay';

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
  actDataS: Stream<StravaSummaryActivity[]>,
  actDataSyncS: Stream<StravaSummaryActivity[] | undefined>,
  syncDateS: Stream<number>,
  sync: () => void,
}
const Viewer: m.ClosureComponent<ViewerAttrs> = (vnode) => {
  const { actDataS, actDataSyncS, syncDateS, sync } = vnode.attrs;
  const actsS = actDataS.map((actData) =>
    _.chain(actData)
      .map((data) => new Act(data))
      .orderBy(['data.start_date'], ['desc'])
      .value()
  );
  actsS.map(() => {
    m.redraw();
  });

  function actById(actId: number) { return _.find(actsS(), (act) => act.data.id === actId); }


  // Here are the layers of the map (all inside map-pane):
  //   overlay-pane
  //     targets
  //   lower tiles
  //   pixi
  //     allActs [filter: colorMap, allActsAlpha]
  //       {bgGraphics for each act} [filter: eachActAlpha]
  //     highlight
  //   upper tiles

  let map: L.Map;
  let pixiOverlay: LeafletPixiOverlay;
  let allActs = new PIXI.Container();
  let satActCount = 5;
  const eachActAlpha = new PIXI.filters.AlphaFilter(0);
  actsS.map((acts) => {
    allActs.removeChildren();
    acts.forEach((act) => {
      if (act.bgGraphics) {
        act.bgGraphics.filters = [ eachActAlpha ];
        allActs.addChild(act.bgGraphics);
      }
    });
  });

  let highlight = new PIXI.Graphics();

  let pixiContainer = new PIXI.Container();
  pixiContainer.addChild(allActs);
  pixiContainer.addChild(highlight);

  const colorMap = new PIXI.Filter(undefined, colorMapFrag);
  const allActsAlpha = new PIXI.filters.AlphaFilter(1);
  allActs.filters = [ colorMap, allActsAlpha ];


  let hoveredActId: number | undefined;
  let selectedActId: number | undefined;
  let highlightChange = false;


  let redrawScheduled = false;
  function scheduleRedraw() {
    if (redrawScheduled) { return; }
    redrawScheduled = true;
    highlightChange = true;
    requestAnimationFrame(() => {
      redrawScheduled = false;
      pixiOverlay.redraw();
    });
  }
  actsS.map(() => {
    scheduleRedraw();
  });


  function setHoveredActivity(newHoveredAct: Act | undefined) {
    const newHoveredActId = newHoveredAct?.data.id;
    if (newHoveredActId === hoveredActId) { return; }
    hoveredActId = newHoveredActId;

    scheduleRedraw();
    m.redraw();
  }

  function setSelectedActivity(newSelectedAct: Act | undefined) {
    const newSelectedActId = newSelectedAct?.data.id;
    selectedActId = selectedActId == newSelectedActId ? undefined : newSelectedActId;

    // fly to activity, in map & table
    const selectedAct = selectedActId && actById(selectedActId);
    if (selectedAct) {
      let polyline = selectedAct.targetPolyline;
      if (polyline) {
        console.log("polyline.getBounds()", JSON.stringify(polyline.getBounds()));
        map.fitBounds(polyline.getBounds());
      }

      let tableRow = selectedAct.tableRow;
      if (tableRow) {
        const tableRect = document.querySelector('.activities')!.getBoundingClientRect();
        const tableRowRect = tableRow.getBoundingClientRect();
        if (tableRowRect.top < tableRect.top || tableRowRect.bottom > tableRect.bottom) {
          tableRow.scrollIntoView({block: 'center', behavior: 'smooth'});
        }
      }
    }

    allActsAlpha.alpha = selectedAct ? 0.5 : 1;

    scheduleRedraw();
    m.redraw();
  }

  let makeMap = (container: HTMLElement) => {
    map = L.map(container, { renderer: L.canvas() });
    // HACK: drawCircle is disabled because it blocks other mouse events
    L.control.locate({ drawCircle: false }).addTo(map);

    // Deselect selected activity when background is clicked
    map.on('click', () => {
      setSelectedActivity(undefined);
    });

    // zIndex values are set relative to the pixiOverlay at zIndex 0.
    const attribution = '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/about-carto/">CARTO</a>';
    const ext = L.Browser.retina ? '@2x.png' : '.png';
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}' + ext, {
        zIndex: -100, pane: 'mapPane', attribution,
    }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}' + ext, {
        zIndex: 100, pane: 'mapPane', attribution,
    }).addTo(map);

    let actsNeedRedraw = true;
    actsS.map(() => actsNeedRedraw = true);
    let prevZoom: number | undefined = undefined;

    pixiOverlay = L.pixiOverlay((utils) => {
      const zoom = utils.getMap().getZoom();
      const container = utils.getContainer();
      const renderer = utils.getRenderer();
      const project = utils.latLngToLayerPoint;
      const scale = utils.getScale();

      if (actsNeedRedraw) {
        actsS().forEach((act) => act.applyProjection(project));
      }

      if (actsNeedRedraw || prevZoom !== zoom) {
        actsS().forEach((act) => {
          if (act.bgGraphics) {
            act.bgGraphics.clear();
            act.bgGraphics.lineTextureStyle({width: 4 / scale, color: 0xFF0000, alpha: 1, join: PIXI.LINE_JOIN.BEVEL, alignment: 0.5});
            drawActivity(act.bgGraphics, act);
          }
        });
      }

      if (actsNeedRedraw || prevZoom !== zoom || highlightChange) {
        highlight.clear();

        const hoveredAct = hoveredActId && actById(hoveredActId);
        if (hoveredAct)  {
          drawHighlight(highlight, hoveredAct,  scale, 0.5);
        }
        const selectedAct = selectedActId && actById(selectedActId);
        if (selectedAct) {
          drawHighlight(highlight, selectedAct, scale, 0.8);
        }

        highlightChange = false;
      }

      actsNeedRedraw = false;
      prevZoom = zoom;

      renderer.render(container);
    }, pixiContainer, {pane: 'mapPane'}).addTo(map);

    // Targets are not drawn, but we use them to detect mouse events on activities
    const targets = L.layerGroup().addTo(map);
    actsS.map((acts) => {
      targets.clearLayers();
      acts.forEach((act) => {
        const latLngs = act.latLngs;
        if (latLngs) {
          act.targetPolyline =
            L.polyline(latLngs, {renderer: targetsRenderer, weight: 14, opacity: 0})
              .bindTooltip(`${act.data.name} (${act.startDate.toLocaleDateString()})`, {sticky: true})
              .on('mouseover', () => setHoveredActivity(act))
              .on('mouseout', () => setHoveredActivity(undefined))
              .on('click', (ev) => { setSelectedActivity(act); L.DomEvent.stop(ev); })
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
      actsS().forEach((act) => {
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
      eachActAlpha.alpha = 1 / satActCount;
      colorMap.uniforms.eachActAlpha = 1 / satActCount;

      return [
        m('.Viewer', [
          m('.Viewer-left',
            m('.Viewer-map', {oncreate: (vnode) => makeMap(vnode.dom as HTMLElement)})
          ),
          m('.Viewer-right', [
            m('.Viewer-activities',
              actsS().map((act) =>
                m(ActivityRow, {
                  act,
                  isHovered: act.data.id === hoveredActId,
                  isSelected: act.data.id === selectedActId,
                  oncreate: (vnode) => act.tableRow = vnode.dom as HTMLElement,
                  attrs: {
                    onmouseover: () => setHoveredActivity(act),
                    onmouseout: () => setHoveredActivity(undefined),
                    onclick: () => setSelectedActivity(act),
                  },
                }),
              )
            ),
            m('.Viewer-controls',
              m('',
                "You are using ", m('span.Viewer-strava-atlas', "Strava Atlas"), ". ",
                "View source ", m('a', {href: 'https://github.com/joshuahhh/strava-atlas'}, 'on GitHub'), ".",
              ),
              m('',
                actDataSyncS()
                ? [
                    'Sync in progress: ',
                    m('span.Shared-loading-progress', {style: {fontWeight: 600}}, `${actDataSyncS()!.length} activities`),
                  ]
                : [
                    `Last synced at ${new Date(syncDateS()).toLocaleString()}. `,
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
