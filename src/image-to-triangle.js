function it_clamp(v, a, b) { return Math.min(Math.max(v, a), b); }
function it_lerp(a, b, t) { return a + (b - a) * t; }
function it_makeRNG(seed = 1) { let s = (seed >>> 0) || 1; return () => ((s = (1664525 * s + 1013904223) >>> 0) / 0x100000000); }
function it_hexToRgb(hex) { const r = parseInt(hex.slice(1, 3), 16); const g = parseInt(hex.slice(3, 5), 16); const b = parseInt(hex.slice(5, 7), 16); return [r, g, b]; }

function it_canvasToDensity(canvas, mode = 'luma') {
   const ctx = canvas.getContext('2d', { willReadFrequently: true });
   const { width: w, height: h } = canvas;
   const id = ctx.getImageData(0, 0, w, h);
   const src = id.data;
   const out = new Float32Array(w * h);
   for (let y = 0, idx = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, idx++, i += 4) {
         const r = src[i] / 255, g = src[i + 1] / 255, b = src[i + 2] / 255;
         let L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
         if (mode === 'lumaBoost') {
            L = it_clamp(0.5 + (L - 0.5) * 1.2, 0, 1);
         } else if (mode === 'red') { L = r; }
         else if (mode === 'green') { L = g; }
         else if (mode === 'blue') { L = b; }
         out[idx] = 1.0 - L;
      }
   }
   return { w, h, data: out, imageData: id };
}

function it_sobelEdgesFromImageData(id) {
   const { width: w, height: h, data: src } = id;
   const gray = new Float32Array(w * h);
   for (let i = 0, p = 0; i < src.length; i += 4, p++) {
      gray[p] = 0.2126 * (src[i] / 255) + 0.7152 * (src[i + 1] / 255) + 0.0722 * (src[i + 2] / 255);
   }
   const out = new Float32Array(w * h);
   let maxMag = 1e-6;
   const ix = (x, y) => gray[y * w + x];
   for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
         const gx = -ix(x - 1, y - 1) + ix(x + 1, y - 1)
            - 2 * ix(x - 1, y) + 2 * ix(x + 1, y)
            - ix(x - 1, y + 1) + ix(x + 1, y + 1);
         const gy = ix(x - 1, y - 1) + 2 * ix(x, y - 1) + ix(x + 1, y - 1)
            - ix(x - 1, y + 1) - 2 * ix(x, y + 1) - ix(x + 1, y + 1);
         const m = Math.hypot(gx, gy);
         out[y * w + x] = m;
         if (m > maxMag) maxMag = m;
      }
   }
   const inv = 1 / maxMag;
   for (let i = 0; i < out.length; i++) out[i] *= inv;
   return { w, h, data: out };
}

function it_computeDensityFieldScaled(canvas, preprocess) {
   const w = canvas.width, h = canvas.height;
   const ctx = canvas.getContext('2d', { willReadFrequently: true });
   const {
      brightness = 1.0, contrast = 1.0, saturation = 1.0, blur = 0,
      invert = false, gamma = 1.0, densityMode = 'luma', edgeBoost = 0
   } = preprocess || {};

   ctx.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) blur(${blur}px)` + (invert ? ' invert(1)' : '');
   ctx.drawImage(canvas, 0, 0, w, h);

   if (Math.abs(gamma - 1.0) > 1e-3 || saturation === 0) {
      const id = ctx.getImageData(0, 0, w, h);
      const d = id.data;
      const gInv = 1.0 / gamma;
      for (let i = 0; i < d.length; i += 4) {
         let r = d[i], g = d[i + 1], b = d[i + 2];
         if (Math.abs(gamma - 1.0) > 1e-3) {
            r = 255 * Math.pow(r / 255, gInv);
            g = 255 * Math.pow(g / 255, gInv);
            b = 255 * Math.pow(b / 255, gInv);
         }
         if (saturation === 0) {
            const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            r = g = b = luma;
         }
         d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
      ctx.putImageData(id, 0, 0);
   }

   const base = it_canvasToDensity(canvas, densityMode);
   if (edgeBoost > 0) {
      const edges = it_sobelEdgesFromImageData(base.imageData);
      const out = new Float32Array(base.w * base.h);
      for (let i = 0; i < out.length; i++) out[i] = it_clamp(base.data[i] + edgeBoost * edges.data[i], 0, 1);
      return { w: base.w, h: base.h, data: out };
   }
   return { w: base.w, h: base.h, data: base.data };
}

function it_densityAt(d, x, y) {
   const x0 = Math.floor(it_clamp(x, 0, d.w - 1));
   const y0 = Math.floor(it_clamp(y, 0, d.h - 1));
   const x1 = Math.min(x0 + 1, d.w - 1);
   const y1 = Math.min(y0 + 1, d.h - 1);
   const sx = it_clamp(x - x0, 0, 1);
   const sy = it_clamp(y - y0, 0, 1);
   const at = (xx, yy) => d.data[yy * d.w + xx];
   const v00 = at(x0, y0), v10 = at(x1, y0), v01 = at(x0, y1), v11 = at(x1, y1);
   return v00 * (1 - sx) * (1 - sy) + v10 * sx * (1 - sy) + v01 * (1 - sx) * sy + v11 * sx * sy;
}

const it_EPS_AREA = 1e-8;
const it_MAX_TRI_FACTOR = 30;
class it_Tri { constructor(a, b, c) { this.a = a; this.b = b; this.c = c; } hasVertex(v) { return this.a === v || this.b === v || this.c === v; } }
function it_triArea2(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function it_isFinitePoint(p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y); }
function it_isGoodTri(t) { return it_isFinitePoint(t.a) && it_isFinitePoint(t.b) && it_isFinitePoint(t.c) && Math.abs(it_triArea2(t.a, t.b, t.c)) > it_EPS_AREA; }
function it_createSuperTriangle(w, h) {
   const delta = Math.max(w, h);
   const midX = w / 2, midY = h / 2;
   const p1 = { x: midX - 20 * delta, y: midY - delta, __id: -1 };
   const p2 = { x: midX, y: midY + 20 * delta, __id: -2 };
   const p3 = { x: midX + 20 * delta, y: midY - delta, __id: -3 };
   return new it_Tri(p1, p2, p3);
}
function it_circumcircleContains(tri, P) {
   if (!it_isGoodTri(tri)) return false;
   let ax = tri.a.x, ay = tri.a.y;
   let bx = tri.b.x, by = tri.b.y;
   let cx = tri.c.x, cy = tri.c.y;
   let a = bx - ax, b = by - ay;
   let c = cx - ax, d = cy - ay;
   let e = a * (ax + bx) + b * (ay + by);
   let f = c * (ax + cx) + d * (ay + cy);
   let g = 2 * (a * (cy - by) - b * (cx - bx));
   if (Math.abs(g) < 1e-9) return false;
   let ox = (d * e - b * f) / g;
   let oy = (a * f - c * e) / g;
   let dx = ox - ax, dy = oy - ay;
   let rsqr = dx * dx + dy * dy;
   dx = P.x - ox; dy = P.y - oy;
   let dsqr = dx * dx + dy * dy;
   return dsqr <= rsqr;
}

async function it_bowyerWatsonAsync(pointList, onTick) {
   if (!pointList || pointList.length < 3) return [];
   let triangles = [];
   const superTri = it_createSuperTriangle(pointList[0].w, pointList[0].h);
   if (!it_isGoodTri(superTri)) return [];
   triangles.push(superTri);

   const edgeKey = (a, b) => {
      const ia = a.__id ?? -Infinity, ib = b.__id ?? -Infinity;
      return ia < ib ? ia + '|' + ib : ib + '|' + ia;
   };

   for (let pi = 0; pi < pointList.length; pi++) {
      const P = pointList[pi];
      if (!it_isFinitePoint(P)) continue;

      const bad = [];
      for (const t of triangles) if (it_circumcircleContains(t, P)) bad.push(t);

      const counts = new Map();
      const addEdge = (a, b) => {
         if (it_isFinitePoint(a) && it_isFinitePoint(b)) {
            const k = edgeKey(a, b);
            const rec = counts.get(k) || { a, b, count: 0 };
            rec.count++;
            counts.set(k, rec);
         }
      };
      for (const t of bad) { addEdge(t.a, t.b); addEdge(t.b, t.c); addEdge(t.c, t.a); }

      if (bad.length) triangles = triangles.filter(t => !bad.includes(t));

      for (const { a, b, count } of counts.values()) {
         if (count === 1) {
            const nt = new it_Tri(a, b, P);
            if (it_isGoodTri(nt)) triangles.push(nt);
         }
      }

      const cap = it_MAX_TRI_FACTOR * (pointList.length + 3);
      if (triangles.length > cap) break;

      if (pi % 10 === 0) { onTick && onTick(pi, pointList.length); await new Promise(requestAnimationFrame); }
   }

   return triangles.filter(t => it_isGoodTri(t) && !t.hasVertex(superTri.a) && !t.hasVertex(superTri.b) && !t.hasVertex(superTri.c));
}

function it_collectDarknessBiasedPoints(density, target, darkStrength, minDist, edgeSamples, random) {
   const pts = [];
   const w = density.w, h = density.h;
   let cell = Math.max(2, minDist);
   let cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
   let grid = Array.from({ length: cols * rows }, () => []);

   const rebuildGrid = () => { cell = Math.max(2, minDist); cols = Math.ceil(w / cell); rows = Math.ceil(h / cell); grid = Array.from({ length: cols * rows }, () => []); };
   const gi = (x, y) => Math.floor(x / cell) + Math.floor(y / cell) * cols;

   function farEnough(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      if (minDist <= 0) return true;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      for (let oy = -1; oy <= 1; oy++) {
         for (let ox = -1; ox <= 1; ox++) {
            const nx = cx + ox, ny = cy + oy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const bucket = grid[nx + ny * cols];
            for (const p of bucket) { const dx = p.x - x, dy = p.y - y; if (dx * dx + dy * dy < minDist * minDist) return false; }
         }
      }
      return true;
   }

   // corners ensure full coverage
   const corners = [
      { x: 0, y: 0, w, h },
      { x: w - 1, y: 0, w, h },
      { x: w - 1, y: h - 1, w, h },
      { x: 0, y: h - 1, w, h }
   ];
   for (const c of corners) { pts.push(c); grid[gi(c.x, c.y)].push(c); }

   if (edgeSamples > 0) {
      const denom = Math.max(1, Math.floor(edgeSamples) - 1);
      for (let i = 0; i < edgeSamples; i++) {
         const t = i / denom;
         const top = { x: it_lerp(0, w - 1, t), y: 0, w, h };
         const bottom = { x: it_lerp(0, w - 1, t), y: h - 1, w, h };
         const left = { x: 0, y: it_lerp(0, h - 1, t), w, h };
         const right = { x: w - 1, y: it_lerp(0, h - 1, t), w, h };
         for (const p of [top, bottom, left, right]) { if (farEnough(p.x, p.y)) { pts.push(p); grid[gi(p.x, p.y)].push(p); } }
      }
   }

   // Adaptive fill: if we fail to reach target because minDist is too large, relax it.
   const tryFill = () => {
      const maxAttempts = Math.max(2000, target * 40);
      let attempts = 0;
      while (pts.length < target && attempts < maxAttempts) {
         attempts++;
         const x = random() * w;
         const y = random() * h;
         const d = it_densityAt(density, x, y);
         const p = Math.pow(it_clamp(d, 0, 1), darkStrength);
         if (random() < p && farEnough(x, y)) { const v = { x, y, w, h }; pts.push(v); grid[gi(x, y)].push(v); }
      }
      return pts.length >= target;
   };

   let success = tryFill();
   if (!success && minDist > 1) {
      const startMin = minDist;
      for (let s = 0; s < 6 && !success; s++) { // relax in up to 6 steps
         minDist = Math.max(1, startMin * (0.8 ** (s + 1)));
         rebuildGrid();
         // re-seed existing points into new grid
         const old = pts.splice(0, pts.length);
         for (const p of old) { if (farEnough(p.x, p.y)) { pts.push(p); grid[gi(p.x, p.y)].push(p); } }
         success = tryFill();
      }
   }

   let nextId = 1;
   for (const p of pts) p.__id = nextId++;
   return pts;
}

function it_sampleImg(canvas, x, y) {
   if (!canvas || !Number.isFinite(x) || !Number.isFinite(y)) return [0, 0, 0, 255];
   const ctx = canvas.getContext('2d', { willReadFrequently: true });
   const xi = Math.min(canvas.width - 1, Math.max(0, Math.floor(x + 0.5)));
   const yi = Math.min(canvas.height - 1, Math.max(0, Math.floor(y + 0.5)));
   const pixel = ctx.getImageData(xi, yi, 1, 1).data;
   return [pixel[0], pixel[1], pixel[2], pixel[3] ?? 255];
}

const ImageToTriangle = (function () {
   /**
    * triangulate(options)
    * - resolution: analysis width (sampling & triangulation happen here)
    * - outputResolution: final render width. Geometry is scaled from analysis → output.
    * - settings.settingsSpace: 'analysis' | 'output' (default 'analysis').
    *   minDist, edgeSamples, wireWidth are interpreted in this space and auto-rescaled.
    */
   async function triangulate({
      image,
      resolution = null,
      outputResolution = null,
      preprocess = {},
      settings = {},
      format = 'canvas',
      onProgress = null
   }) {
      const {
         brightness = 1.0,
         contrast = 1.0,
         saturation = 1.0,
         blur = 0,
         invert = false,
         gamma = 1.0,
         densityMode = 'luma',
         edgeBoost = 0
      } = preprocess || {};

      let {
         points = 3000,
         darkStrength = 4.0,
         minDist = 8,
         edgeSamples = 20,
         showWires = true,
         wireColor = '#ffffff',
         wireWidth = 1,
         seed = 0,
         settingsSpace = 'analysis' // interpret size params in 'analysis' or 'output'
      } = settings || {};

      // Clamp darkStrength to sane range (avoid accidental width/50 etc.)
      darkStrength = it_clamp(darkStrength, 0.1, 8.0);

      // Progress bookkeeping
      const progressSteps = { canvasPrep: 5, density: 20, points: 25, triangulation: 40, rendering: 10 };
      let currentProgress = 0;
      const reportProgress = (step, subProgress = 1) => {
         if (onProgress) {
            const stepProgress = progressSteps[step] * subProgress;
            currentProgress = Math.min(100, currentProgress + stepProgress);
            onProgress(Math.floor(currentProgress));
         }
      };

      // 1) Source canvas
      let srcCanvas;
      if (image instanceof HTMLCanvasElement) { srcCanvas = image; }
      else if (image instanceof HTMLImageElement) {
         srcCanvas = document.createElement('canvas');
         srcCanvas.width = image.width; srcCanvas.height = image.height;
         srcCanvas.getContext('2d').drawImage(image, 0, 0);
      } else { throw new Error('Input must be an HTMLCanvasElement or HTMLImageElement'); }

      // 2) Analysis canvas
      const maxDim = 1000; // cap if neither resolution nor small source
      const srcW = srcCanvas.width, srcH = srcCanvas.height;
      let anaW = srcW, anaH = srcH;
      if (resolution) { anaW = Math.round(resolution); anaH = Math.round(resolution * (srcH / srcW)); }
      else if (Math.max(srcW, srcH) > maxDim) { const s = maxDim / Math.max(srcW, srcH); anaW = Math.round(srcW * s); anaH = Math.round(srcH * s); }

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = anaW; tempCanvas.height = anaH;
      tempCanvas.getContext('2d').drawImage(srcCanvas, 0, 0, anaW, anaH);
      reportProgress('canvasPrep'); await new Promise(requestAnimationFrame);

      // 3) Density in analysis space
      const density = it_computeDensityFieldScaled(tempCanvas, { brightness, contrast, saturation, blur, invert, gamma, densityMode, edgeBoost });
      reportProgress('density'); await new Promise(requestAnimationFrame);

      // 4) Normalize size-dependent settings into ANALYSIS units
      let outW = anaW, outH = anaH;
      if (outputResolution) {
         const s = outputResolution / anaW; outW = Math.round(anaW * s); outH = Math.round(anaH * s);
      }
      const sx = outW / anaW, sy = outH / anaH; // uniform scale but keep explicit

      const toAnalysis = (v) => settingsSpace === 'output' ? v / sx : v; // map from chosen space → analysis
      minDist = toAnalysis(minDist);
      edgeSamples = toAnalysis(edgeSamples);
      const analysisWireWidth = toAnalysis(wireWidth);

      // 5) Points in analysis space
      const rng = it_makeRNG(seed);
      const pointList = it_collectDarknessBiasedPoints(density, points, darkStrength, minDist, edgeSamples, rng);
      reportProgress('points'); await new Promise(requestAnimationFrame);

      // 6) Triangulate in analysis space
      const triangulationStart = currentProgress, triangulationWeight = progressSteps.triangulation;
      const triangles = await it_bowyerWatsonAsync(pointList, (done, total) => {
         if (onProgress) { const sub = done / total; onProgress(Math.floor(triangulationStart + triangulationWeight * sub)); }
      });
      currentProgress = triangulationStart + triangulationWeight; await new Promise(requestAnimationFrame);

      // 7) Render in output space (scale geometry; sample color in analysis space)
      if (format === 'canvas' || format === 'image') {
         const outputCanvas = document.createElement('canvas');
         outputCanvas.width = outW; outputCanvas.height = outH;
         const ctx = outputCanvas.getContext('2d');

         const [r0, g0, b0, a0] = it_sampleImg(tempCanvas, 0, 0);
         ctx.fillStyle = `rgba(${r0},${g0},${b0},${a0 / 255})`;
         ctx.fillRect(0, 0, outW, outH);

         for (const t of triangles) {
            const cx = (t.a.x + t.b.x + t.c.x) / 3, cy = (t.a.y + t.b.y + t.c.y) / 3;
            const [cr, cg, cb, ca] = it_sampleImg(tempCanvas, cx, cy);

            ctx.beginPath();
            ctx.moveTo(t.a.x * sx, t.a.y * sy);
            ctx.lineTo(t.b.x * sx, t.b.y * sy);
            ctx.lineTo(t.c.x * sx, t.c.y * sy);
            ctx.closePath();

            ctx.fillStyle = `rgba(${cr},${cg},${cb},${ca / 255})`;
            ctx.fill();

            // Anti-gap stroke when wires are off
            if (!showWires) {
               ctx.strokeStyle = `rgba(${cr},${cg},${cb},${ca / 255})`;
               ctx.lineWidth = Math.max(0.5, analysisWireWidth * sx);
               ctx.stroke();
            }
         }

         if (showWires) {
            const [wr, wg, wb] = it_hexToRgb(wireColor);
            ctx.strokeStyle = `rgba(${wr},${wg},${wb},0.24)`;
            ctx.lineWidth = Math.max(0.5, analysisWireWidth * sx);
            ctx.beginPath();
            for (const t of triangles) {
               ctx.moveTo(t.a.x * sx, t.a.y * sy);
               ctx.lineTo(t.b.x * sx, t.b.y * sy);
               ctx.lineTo(t.c.x * sx, t.c.y * sy);
               ctx.lineTo(t.a.x * sx, t.a.y * sy);
            }
            ctx.stroke();
         }

         reportProgress('rendering');
         if (format === 'canvas') return outputCanvas;
         const img = new Image(); img.src = outputCanvas.toDataURL('image/png'); return img;
      } else if (format === 'svg') {
         let [r0, g0, b0, a0] = it_sampleImg(tempCanvas, 0, 0);
         let paths = `<rect x="0" y="0" width="${outW}" height="${outH}" fill="rgb(${r0},${g0},${b0})" fill-opacity="${a0 / 255}" />\n`;
         for (const t of triangles) {
            const x1 = t.a.x * sx, y1 = t.a.y * sy; const x2 = t.b.x * sx, y2 = t.b.y * sy; const x3 = t.c.x * sx, y3 = t.c.y * sy;
            const cx = (t.a.x + t.b.x + t.c.x) / 3, cy = (t.a.y + t.b.y + t.c.y) / 3;
            const [cr, cg, cb, ca] = it_sampleImg(tempCanvas, cx, cy);
            let attr = `fill="rgb(${cr},${cg},${cb})" `;
            if (showWires) { attr += `stroke="${wireColor}" stroke-opacity="0.24" stroke-width="${Math.max(0.5, analysisWireWidth * sx)}" `; }
            else { attr += `stroke="rgb(${cr},${cg},${cb})" stroke-width="${Math.max(0.5, analysisWireWidth * sx)}" `; }
            paths += `<path d="M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} L${x3.toFixed(2)} ${y3.toFixed(2)} Z" ${attr}/>\n`;
         }
         reportProgress('rendering');
         return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}">\n${paths}</svg>`;
      } else {
         throw new Error('Unsupported format: ' + format);
      }
   }

   return { triangulate };
})();
