declare module 'leaflet-pixi-overlay' {
  import * as PIXI from 'pixi.js';
  import L from 'leaflet';

  interface LeafletPixiOverlay extends L.Layer {
    redraw: (data?: any) => void,
  }

  interface LeafletPixiOverlayOptions {
    pane?: string,
  }

  interface LeafletPixiOverlayUtils {
    latLngToLayerPoint(latLng: L.LatLngExpression, zoom?: number): L.Point,
    layerPointToLatLng(point: L.Point, zoom?: number): L.LatLng,
    getScale(zoom?: number): number,
    getRenderer(): PIXI.Renderer,
    getContainer(): PIXI.Container,
    getMap(): L.Map,
  }

  module "leaflet" {
    function pixiOverlay(
      drawCallback: (utils: LeafletPixiOverlayUtils) => void,
      container: PIXI.Container,
      options?: LeafletPixiOverlayOptions
    ): LeafletPixiOverlay;
  }
}
