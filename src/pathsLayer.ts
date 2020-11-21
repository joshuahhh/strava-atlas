import Stream from 'mithril/stream';

import { Act } from './Act';

import L from 'leaflet';
import 'leaflet-pixi-overlay';
import * as PIXI from 'pixi.js';


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
  const projectedPoints = act.projPoints;
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


interface PathsLayerArgs {
  visibleActs$: Stream<Act[]>,
  hoveredActIds$: Stream<number[]>,
  selectedActId$: Stream<number | undefined>,
}
export default function pathsLayer({visibleActs$, hoveredActIds$, selectedActId$}: PathsLayerArgs): L.Layer {
  let satActCount = 5;

  const pixiContainer = new PIXI.Container();

  const allActPaths = new PIXI.Container();
  pixiContainer.addChild(allActPaths);

  const eachActAlphaFilter = new PIXI.filters.AlphaFilter(1 / satActCount);
  visibleActs$.map((acts) => {
    allActPaths.removeChildren();
    acts.forEach((act) => {
      if (!act.path) {
        act.path = new PIXI.Graphics();
      }
      act.path.filters = [ eachActAlphaFilter ];
      allActPaths.addChild(act.path);
    });
  });
  const colorMapFilter = new PIXI.Filter(undefined, colorMapFrag);
  colorMapFilter.uniforms.eachActAlpha = 1 / satActCount;
  const allActsAlphaFilter = new PIXI.filters.AlphaFilter(1);
  selectedActId$.map((selectedActId) => {
    // fade out other paths if an act is selected
    allActsAlphaFilter.alpha = selectedActId ? 0.5 : 1;
  });
  allActPaths.filters = [ colorMapFilter, allActsAlphaFilter ];

  const hoveredActPath = new PIXI.Graphics();
  pixiContainer.addChild(hoveredActPath);

  const selectedActPath = new PIXI.Graphics();
  pixiContainer.addChild(selectedActPath);

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
  visibleActs$.map(() => { actsChanged = true; scheduleRedrawPathsLayer(); });
  let hoveredActIdsChanged = true;
  hoveredActIds$.map(() => { hoveredActIdsChanged = true; scheduleRedrawPathsLayer(); });
  let selectedActIdChanged = true;
  selectedActId$.map(() => { selectedActIdChanged = true; scheduleRedrawPathsLayer(); });

  let prevZoom: number | undefined = undefined;
  const pathsLayer = L.pixiOverlay((utils) => {
    const zoom = utils.getMap().getZoom();
    const renderer = utils.getRenderer();
    const project = utils.latLngToLayerPoint;
    const scale = utils.getScale();

    const zoomChanged = prevZoom !== zoom;

    if (actsChanged) {
      visibleActs$().forEach((act) => act.applyProjection(project, utils.getScale));
    }

    if (actsChanged || zoomChanged) {
      visibleActs$().forEach((act) => {
        if (act.path) {
          act.path.clear();
          act.path.lineTextureStyle({width: 4 / scale, color: 0xFF0000, alpha: 1, join: PIXI.LINE_JOIN.BEVEL, alignment: 0.5});
          drawActivity(act.path, act);
        }
      });
    }

    if (hoveredActIdsChanged || zoomChanged) {
      hoveredActPath.clear();
      const hoveredActs = visibleActs$().filter((act) => hoveredActIds$().includes(act.data.id));
      hoveredActs.forEach((hoveredAct) => {
        hoveredActPath.lineTextureStyle({width: 9 / scale, color: 0x000000, join: PIXI.LINE_JOIN.ROUND, cap: PIXI.LINE_CAP.ROUND, alignment: 0.5});
        drawActivity(hoveredActPath, hoveredAct);
        hoveredActPath.lineTextureStyle({width: 4 / scale, color: 0xEEEE00, join: PIXI.LINE_JOIN.ROUND, cap: PIXI.LINE_CAP.ROUND, alignment: 0.5});
        drawActivity(hoveredActPath, hoveredAct);
      });
    }

    if (selectedActIdChanged || zoomChanged) {
      selectedActPath.clear();
      const selectedAct = visibleActs$().find((act) => act.data.id === selectedActId$());
      if (selectedAct)  {
        selectedActPath.lineTextureStyle({width: 9 / scale, color: 0x000000, join: PIXI.LINE_JOIN.ROUND, cap: PIXI.LINE_CAP.ROUND, alignment: 0.5});
        drawActivity(selectedActPath, selectedAct);
        selectedActPath.lineTextureStyle({width: 4 / scale, color: 0x00EE00, join: PIXI.LINE_JOIN.ROUND, cap: PIXI.LINE_CAP.ROUND, alignment: 0.5});
        drawActivity(selectedActPath, selectedAct);
      }
    }

    actsChanged = false;
    hoveredActIdsChanged = false;
    selectedActIdChanged = false;
    prevZoom = zoom;

    renderer.render(pixiContainer);
  }, pixiContainer, {pane: 'mapPane'});

  return pathsLayer;
}