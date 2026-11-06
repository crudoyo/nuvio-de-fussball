/**
 * Rasterize the precomposed SVG match card on Cloudflare's edge.
 * The regular client receives a normal image/png instead of an SVG with
 * embedded image data URIs, which some Android renderers omit.
 *
 * Keep the module separate: Node-based unit tests import worker.js directly,
 * while Wrangler bundles this file and the WebAssembly/font assets for Workers.
 */
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import regularFont from '@fontsource/roboto/files/roboto-latin-400-normal.woff2';
import boldFont from '@fontsource/roboto/files/roboto-latin-700-normal.woff2';

let initialization;
export async function renderPng(svg) {
  initialization ||= initWasm(wasm);
  await initialization;
  const renderer = new Resvg(svg, {
    fitTo: {mode: 'original'},
    font: {
      loadSystemFonts: false,
      defaultFontFamily: 'Roboto',
      fontBuffers: [new Uint8Array(regularFont), new Uint8Array(boldFont)]
    }
  });
  const image = renderer.render().asPng();
  return image;
}
