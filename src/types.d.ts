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

declare module 'leaflet.locatecontrol' {
  import L from 'leaflet';

  // Copied from @types/leaflet.locatecontrol, which mysteriously isn't working.
  module "leaflet" {
    namespace Control {
      class Locate extends Control {
        onAdd(map: Map): HTMLElement;
        start(): void;
        stop(): void;
        setView(): void;
      }
      interface LocateOptions {
        position?: string,
        layer?: Layer,
        setView?: boolean | string,
        flyTo?: boolean,
        keepCurrentZoomLevel?: boolean,
        clickBehavior?: any,
        returnToPrevBounds?: boolean,
        cacheLocation?: boolean,
        drawCircle?: boolean,
        drawMarker?: boolean,
        markerClass?: any,
        circleStyle?: PathOptions,
        markerStyle?: PathOptions | MarkerOptions,
        followCircleStyle?: PathOptions,
        followMarkerStyle?: PathOptions,
        icon?: string,
        iconLoading?: string,
        iconElementTag?: string,
        circlePadding?: number[],
        onLocationError?: any,
        onLocationOutsideMapBounds?: any,
        showPopup?: boolean,
        strings?: any,
        locateOptions?: L.LocateOptions,
      }
    }

    namespace control {
        /**
         * Creates a Leaflet.Locate control
         */
        function locate(options?: Control.LocateOptions): Control.Locate;
    }
  }
}