import { CompositeLayer, type Layer } from "@deck.gl/core";
import { PathLayer, type PathLayerProps } from "@deck.gl/layers";
import type { Framebuffer, Texture } from "@luma.gl/core";

import { Act } from "./Act";

const EACH_ACT_ALPHA = 0.2;
const HEATMAP_WIDTH_PX = 4;
const OUTLINE_OUTER_PX = 9;
const OUTLINE_INNER_PX = 4;

const COLOR_WHITE: [number, number, number, number] = [255, 255, 255, 255];
const COLOR_BLACK: [number, number, number, number] = [0, 0, 0, 255];
const COLOR_HOVER: [number, number, number, number] = [238, 238, 0, 255];
const COLOR_SELECTED: [number, number, number, number] = [0, 238, 0, 255];

const colormapVS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_quad;
out vec2 v_uv;
void main() {
  v_uv = a_quad * 0.5 + 0.5;
  gl_Position = vec4(a_quad, 0.0, 1.0);
}
`;

const colormapFS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_eachActAlpha;
uniform float u_overallAlpha;
out vec4 fragColor;

vec4 colormap(float x) {
  float r = clamp(8.0 / 3.0 * x, 0.0, 1.0);
  float g = clamp(8.0 / 3.0 * x - 1.0, 0.0, 1.0);
  float b = clamp(max(4.0 * x - 3.0, 1.0 - 4.0 / 3.0 * x), 0.0, 1.0);
  return vec4(r, g, b, 1.0);
}

void main() {
  float accum = texture(u_tex, v_uv).r;
  float newAlpha = clamp(accum / u_eachActAlpha, 0.0, 1.0);
  float val = accum - u_eachActAlpha;
  if (u_eachActAlpha < 1.0) val = val / (1.0 - u_eachActAlpha);
  fragColor = colormap(val * 0.6) * newAlpha * u_overallAlpha;
}
`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("colormap shader compile failed: " + log);
  }
  return sh;
}

function buildColormapProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, colormapVS));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, colormapFS));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("colormap program link failed: " + log);
  }
  return p;
}

interface HeatmapPathLayerProps<DataT = Act> extends PathLayerProps<DataT> {
  overallAlpha?: number;
  /** Per-path index (used as a depth value to suppress self-overlap). */
  getPathIndex?: (object: DataT, info: { index: number }) => number;
}

// Subclass of PathLayer that:
//   1) renders strokes into a private framebuffer with additive blend, with a
//      shader-injected fragment color of (eachActAlpha, 0, 0, eachActAlpha*aa)
//      so PathLayer's geometry/AA still drives the alpha
//   2) draws a fullscreen colormap quad over MapLibre's framebuffer, sampling
//      the accumulated red channel through a colormap shader.
class HeatmapPathLayer<DataT = Act> extends PathLayer<
  DataT,
  HeatmapPathLayerProps<DataT>
> {
  static override layerName = "HeatmapPathLayer";

  initializeState(): void {
    super.initializeState();
    // Add a custom per-instance attribute that holds the path index, which
    // the vertex shader uses as a per-path depth value (see getShaders).
    this.getAttributeManager()!.addInstanced({
      instancePathIndex: {
        size: 1,
        accessor: "getPathIndex",
        type: "float32",
        defaultValue: 0,
      },
    });
    this.setState({
      fbo: null as Framebuffer | null,
      fboTex: null as Texture | null,
      fboW: 0,
      fboH: 0,
      colormapProgram: null as WebGLProgram | null,
      colormapVao: null as WebGLVertexArrayObject | null,
      colormapVbo: null as WebGLBuffer | null,
      uTex: null as WebGLUniformLocation | null,
      uEachAlpha: null as WebGLUniformLocation | null,
      uOverall: null as WebGLUniformLocation | null,
    });
  }

  finalizeState(context: any): void {
    const s = this.state as any;
    s.fbo?.destroy();
    s.fboTex?.destroy();
    const gl = (this.context.device as any).gl as WebGL2RenderingContext;
    if (s.colormapProgram) gl.deleteProgram(s.colormapProgram);
    if (s.colormapVao) gl.deleteVertexArray(s.colormapVao);
    if (s.colormapVbo) gl.deleteBuffer(s.colormapVbo);
    super.finalizeState(context);
  }

  getShaders(): any {
    const sh = super.getShaders();
    return {
      ...sh,
      inject: {
        ...(sh.inject || {}),
        // Replace the per-fragment color so we accumulate eachActAlpha into
        // the red channel (and alpha channel, premultiplied with PathLayer's
        // own AA). The PathLayer adds AA via the .a of fragColor.
        "fs:DECKGL_FILTER_COLOR": `
          // Premultiplied output. Combined with (ONE, ONE_MINUS_SRC_ALPHA)
          // blend below, this gives the same alpha-over accumulation curve
          // as the original PIXI version: red ≈ 1 - (1 - eachActAlpha)^N.
          color = vec4(${EACH_ACT_ALPHA.toFixed(4)}, 0.0, 0.0,
                       ${EACH_ACT_ALPHA.toFixed(4)});
        `,
        // Declare our custom per-path attribute (added in initializeState
        // via the attribute manager) at the top of the vertex shader.
        "vs:#decl": "in float instancePathIndex;\n",
        // Encode the path index into gl_Position.z so depthCompare='less'
        // (set in draw()) suppresses a single path's *self*-overlap —
        // matching the PIXI "render each path opaquely then composite at
        // alpha=0.2" semantics — while still letting different paths
        // accumulate at cross-path pixels.
        "vs:DECKGL_FILTER_GL_POSITION": `
          float _pDepth = 0.99 - instancePathIndex * 0.0000001;
          position.z = (_pDepth * 2.0 - 1.0) * position.w;
        `,
      },
    };
  }

  draw(_opts: any): void {
    const device = this.context.device as any;
    const gl = device.gl as WebGL2RenderingContext;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const s = this.state as any;


    // Lazy / resize FBO
    if (!s.fbo || s.fboW !== w || s.fboH !== h) {
      s.fbo?.destroy();
      s.fboTex?.destroy();
      const fboTex = device.createTexture({
        format: "rgba8unorm",
        width: w,
        height: h,
        sampler: { minFilter: "linear", magFilter: "linear" },
      }) as Texture;
      const fbo = device.createFramebuffer({
        width: w,
        height: h,
        colorAttachments: [fboTex],
        // Depth buffer is used to suppress *self*-overlap of a single path
        // via a per-path depth value + depthCompare='not-equal' (see draw()).
        depthStencilAttachment: "depth32float",
      }) as Framebuffer;
      this.setState({ fbo, fboTex, fboW: w, fboH: h });
    }

    // Lazy colormap program + VAO
    if (!s.colormapProgram) {
      const program = buildColormapProgram(gl);
      const vbo = gl.createBuffer()!;
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      this.setState({
        colormapProgram: program,
        colormapVao: vao,
        colormapVbo: vbo,
        uTex: gl.getUniformLocation(program, "u_tex"),
        uEachAlpha: gl.getUniformLocation(program, "u_eachActAlpha"),
        uOverall: gl.getUniformLocation(program, "u_overallAlpha"),
      });
    }

    const state = this.state as any;

    // Pass 1: render PathLayer's geometry into our private FBO with additive
    // blend. We start a luma.gl render pass targeting our framebuffer, then
    // replicate PathLayer's draw-time uniform setup before drawing the model.
    const fbPass = device.beginRenderPass({
      framebuffer: state.fbo,
      clearColor: [0, 0, 0, 0],
      clearDepth: 1, // far plane; per-path depths decrease from there
      parameters: {
        viewport: [0, 0, w, h],
      },
    });

    const props = this.props as any;
    const model = (this.state as any).model;
    const pathProps = {
      jointType: Number(props.jointRounded),
      capType: Number(props.capRounded),
      billboard: props.billboard,
      widthUnits: 2, // UNIT.pixels
      widthScale: props.widthScale,
      miterLimit: props.miterLimit,
      widthMinPixels: props.widthMinPixels,
      widthMaxPixels: props.widthMaxPixels,
    };
    model.shaderInputs.setProps({ path: pathProps });

    // Override the model's pipeline params:
    //  - premultiplied alpha-over accumulation (matches PIXI curve)
    //  - depth test 'not-equal' against per-path depth values to dedupe
    //    a single path's self-overlap
    const origParams = model.parameters;
    model.parameters = {
      ...origParams,
      blend: true,
      blendColorOperation: "add",
      blendColorSrcFactor: "one",
      blendColorDstFactor: "one-minus-src-alpha",
      blendAlphaOperation: "add",
      blendAlphaSrcFactor: "one",
      blendAlphaDstFactor: "one-minus-src-alpha",
      depthCompare: "less",
      depthWriteEnabled: true,
    };
    model.draw(fbPass);
    model.parameters = origParams;
    fbPass.end();


    // Pass 2: apply the colormap onto MapLibre's framebuffer.
    // After pass.end() luma.gl restores the prior framebuffer binding (the
    // one deck.gl was rendering into), so plain GL calls now target it.
    const overallAlpha = (this.props as HeatmapPathLayerProps<DataT>)
      .overallAlpha;
    gl.useProgram(state.colormapProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, (state.fboTex.handle as WebGLTexture));
    gl.uniform1i(state.uTex, 0);
    gl.uniform1f(state.uEachAlpha, EACH_ACT_ALPHA);
    gl.uniform1f(state.uOverall, overallAlpha ?? 1.0);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(state.colormapVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}

// Public CompositeLayer — bundles the heatmap with hover/select outlines.
interface StravaPathsLayerProps {
  id?: string;
  acts: Act[];
  hoveredIds: number[];
  selectedId?: number;
  beforeId?: string;
}

export class StravaPathsLayer extends CompositeLayer<StravaPathsLayerProps> {
  static override layerName = "StravaPathsLayer";

  renderLayers(): Layer[] {
    const { acts, hoveredIds, selectedId } = this.props;
    const hoveredSet = new Set(hoveredIds);
    const hoveredOnly = acts.filter(
      (a) => hoveredSet.has(a.data.id) && a.data.id !== selectedId,
    );
    const selectedAct = acts.find((a) => a.data.id === selectedId);
    const outlineActs = selectedAct
      ? [...hoveredOnly, selectedAct]
      : hoveredOnly;

    const getPath = (a: Act): [number, number][] =>
      a.latLngs ? a.latLngs.map(([lat, lng]) => [lng, lat]) : [];

    const layers: (Layer | undefined | false | null)[] = [
      new HeatmapPathLayer({
        id: `${this.props.id}-heatmap`,
        data: acts,
        getPath,
        getColor: COLOR_WHITE,
        getWidth: HEATMAP_WIDTH_PX,
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
        // Per-path id used by the depth trick that suppresses self-overlap.
        getPathIndex: (_a: Act, info: { index: number }) => info.index,
        overallAlpha: selectedId !== undefined ? 0.5 : 1.0,
        updateTriggers: {
          getPath: acts,
          getPathIndex: acts,
        },
      }),
      outlineActs.length > 0 &&
        new PathLayer<Act>({
          id: `${this.props.id}-outline-halo`,
          data: outlineActs,
          getPath,
          getColor: COLOR_BLACK,
          getWidth: OUTLINE_OUTER_PX,
          widthUnits: "pixels",
          capRounded: true,
          jointRounded: true,
        }),
      hoveredOnly.length > 0 &&
        new PathLayer<Act>({
          id: `${this.props.id}-outline-hovered`,
          data: hoveredOnly,
          getPath,
          getColor: COLOR_HOVER,
          getWidth: OUTLINE_INNER_PX,
          widthUnits: "pixels",
          capRounded: true,
          jointRounded: true,
        }),
      selectedAct &&
        new PathLayer<Act>({
          id: `${this.props.id}-outline-selected`,
          data: [selectedAct],
          getPath,
          getColor: COLOR_SELECTED,
          getWidth: OUTLINE_INNER_PX,
          widthUnits: "pixels",
          capRounded: true,
          jointRounded: true,
        }),
    ];
    return layers.filter(Boolean) as Layer[];
  }
}
