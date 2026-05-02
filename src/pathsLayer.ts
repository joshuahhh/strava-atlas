import L from "leaflet";
import "leaflet-pixi-overlay";
import * as PIXI from "pixi.js";

import { Act } from "./Act";

PIXI.utils.skipHello();
PIXI.settings.FILTER_RESOLUTION = L.Browser.retina ? 2 : 1;

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
  gl_FragColor = colormap(val * 0.6) * newAlpha;
}
`;

function drawActivity(gs: PIXI.Graphics, act: Act) {
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

export type PathsLayerChange = "acts" | "hovered" | "selected";

interface PathsLayerArgs {
  visibleActsRef: { current: Act[] };
  hoveredActIdsRef: { current: number[] };
  selectedActIdRef: { current: number | undefined };
}

export interface PathsLayerHandle {
  layer: L.Layer;
  notify: (change: PathsLayerChange) => void;
}

export function pathsLayer({
  visibleActsRef,
  hoveredActIdsRef,
  selectedActIdRef,
}: PathsLayerArgs): PathsLayerHandle {
  const satActCount = 5;

  const pixiContainer = new PIXI.Container();

  const allActPaths = new PIXI.Container();
  pixiContainer.addChild(allActPaths);

  const eachActAlphaFilter = new PIXI.filters.AlphaFilter(1 / satActCount);
  const colorMapFilter = new PIXI.Filter(undefined, colorMapFrag);
  colorMapFilter.uniforms.eachActAlpha = 1 / satActCount;
  const allActsAlphaFilter = new PIXI.filters.AlphaFilter(1);
  allActPaths.filters = [colorMapFilter, allActsAlphaFilter];

  const hoveredActPath = new PIXI.Graphics();
  pixiContainer.addChild(hoveredActPath);

  const selectedActPath = new PIXI.Graphics();
  pixiContainer.addChild(selectedActPath);

  // Sync the PIXI children to match the current visibleActs (called whenever visibleActs changes).
  function syncActChildren() {
    allActPaths.removeChildren();
    visibleActsRef.current.forEach((act) => {
      if (!act.path) {
        act.path = new PIXI.Graphics();
      }
      act.path.filters = [eachActAlphaFilter];
      allActPaths.addChild(act.path);
    });
  }

  let actsChanged = true;
  let hoveredActIdsChanged = true;
  let selectedActIdChanged = true;
  let scheduledRedraw = false;

  function scheduleRedraw() {
    if (scheduledRedraw) return;
    scheduledRedraw = true;
    requestAnimationFrame(() => {
      layer.redraw();
      scheduledRedraw = false;
    });
  }

  function notify(change: PathsLayerChange) {
    if (change === "acts") {
      syncActChildren();
      actsChanged = true;
    } else if (change === "hovered") {
      hoveredActIdsChanged = true;
    } else if (change === "selected") {
      selectedActIdChanged = true;
      // Fade out other paths if an act is selected.
      allActsAlphaFilter.alpha = selectedActIdRef.current ? 0.5 : 1;
    }
    scheduleRedraw();
  }

  let prevZoom: number | undefined = undefined;
  let interactionDisabled = false;
  const layer = L.pixiOverlay(
    (utils) => {
      const zoom = utils.getMap().getZoom();
      const renderer = utils.getRenderer();
      // PIXI's interaction plugin calls preventDefault on touchend, which
      // suppresses the synthesized click on Firefox Android. We don't use
      // PIXI's hit-testing, so disable it.
      if (!interactionDisabled) {
        const interaction = (renderer as PIXI.Renderer).plugins?.interaction;
        if (interaction) {
          interaction.autoPreventDefault = false;
          interaction.destroy();
        }
        interactionDisabled = true;
      }
      const project = utils.latLngToLayerPoint;
      const scale = utils.getScale();

      const zoomChanged = prevZoom !== zoom;

      if (actsChanged) {
        visibleActsRef.current.forEach((act) =>
          act.applyProjection(project, utils.getScale),
        );
      }

      // bounds-based culling
      const mapBounds = utils.getMap().getBounds();
      const mapBoundsProj = L.bounds(
        project(mapBounds.getSouthWest()),
        project(mapBounds.getNorthEast()),
      );
      visibleActsRef.current.forEach((act) => {
        if (act.path) {
          if (
            act.projBounds &&
            mapBoundsProj.overlaps(act.projBounds) &&
            act.projPoints?.some((p) => mapBoundsProj.contains(p))
          ) {
            act.path.visible = true;

            if (act.pathZoom !== zoom) {
              act.pathZoom = zoom;
              act.path.clear();
              act.path.lineTextureStyle({
                width: 4 / scale,
                color: 0xff0000,
                alpha: 1,
                join: PIXI.LINE_JOIN.BEVEL,
                alignment: 0.5,
              });
              drawActivity(act.path, act);
            }
          } else {
            act.path.visible = false;
          }
        }
      });

      if (hoveredActIdsChanged || zoomChanged) {
        if (hoveredActIdsRef.current.length < 200) {
          hoveredActPath.clear();
          const hoveredActs = visibleActsRef.current.filter((act) =>
            hoveredActIdsRef.current.includes(act.data.id),
          );
          hoveredActs.forEach((hoveredAct) => {
            hoveredActPath.lineTextureStyle({
              width: 9 / scale,
              color: 0x000000,
              join: PIXI.LINE_JOIN.ROUND,
              cap: PIXI.LINE_CAP.ROUND,
              alignment: 0.5,
            });
            drawActivity(hoveredActPath, hoveredAct);
            hoveredActPath.lineTextureStyle({
              width: 4 / scale,
              color: 0xeeee00,
              join: PIXI.LINE_JOIN.ROUND,
              cap: PIXI.LINE_CAP.ROUND,
              alignment: 0.5,
            });
            drawActivity(hoveredActPath, hoveredAct);
          });
        }
      }

      if (selectedActIdChanged || zoomChanged) {
        selectedActPath.clear();
        const selectedAct = visibleActsRef.current.find(
          (act) => act.data.id === selectedActIdRef.current,
        );
        if (selectedAct) {
          selectedActPath.lineTextureStyle({
            width: 9 / scale,
            color: 0x000000,
            join: PIXI.LINE_JOIN.ROUND,
            cap: PIXI.LINE_CAP.ROUND,
            alignment: 0.5,
          });
          drawActivity(selectedActPath, selectedAct);
          selectedActPath.lineTextureStyle({
            width: 4 / scale,
            color: 0x00ee00,
            join: PIXI.LINE_JOIN.ROUND,
            cap: PIXI.LINE_CAP.ROUND,
            alignment: 0.5,
          });
          drawActivity(selectedActPath, selectedAct);
        }
      }

      actsChanged = false;
      hoveredActIdsChanged = false;
      selectedActIdChanged = false;
      prevZoom = zoom;

      renderer.render(pixiContainer);
    },
    pixiContainer,
    { pane: "mapPane" },
  );

  const handle: PathsLayerHandle = { layer, notify };
  // Initial child sync so the first render has the right contents.
  syncActChildren();
  return handle;
}
