// State
let ui = {}, img = null;
let prevCanvas, prevCtx, pathCanvas, pathCtx;
let lastPreviewSize = { w: 0, h: 0 };
let lastFit = { dx: 0, dy: 0, dw: 1, dh: 1 };
let triangleCanvas = null;

// Helpers
const nextFrame = () => new Promise(requestAnimationFrame);

function fitContain(sw, sh, bw, bh) {
   const s = Math.min(bw / sw, bh / sh);
   const dw = Math.max(1, Math.round(sw * s));
   const dh = Math.max(1, Math.round(sh * s));
   const dx = Math.round((bw - dw) / 2);
   const dy = Math.round((bh - dh) / 2);
   return { dx, dy, dw, dh };
}

function debounce(fn, ms = 16) {
   let t;
   return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
   };
}

function updateProgress(pct) {
   const p = Math.floor(pct);
   ui.progressBar.style.width = p + '%';
   ui.progressText.textContent = p + '%';
}

// Link input fields
function link(a, b) {
   a.addEventListener('input', () => b.value = a.value);
   b.addEventListener('change', () => a.value = b.value);
}

// Draw placeholder
function drawPreviewPlaceholder() {
   prevCtx.fillStyle = '#121416b4';
   prevCtx.fillRect(0, 0, prevCanvas.width, prevCanvas.height);
   prevCtx.fillStyle = '#ffffff';
   prevCtx.textAlign = 'center';
   prevCtx.textBaseline = 'middle';
   prevCtx.font = '600 14px Google Sans Code, IBM Plex Mono,system-ui, -apple-system, Segoe UI, Roboto';
   prevCtx.fillText('Load an image to begin', prevCanvas.width / 2, prevCanvas.height / 2);
}

function drawPathPlaceholder() {
   pathCtx.fillStyle = '#121416b4';
   pathCtx.fillRect(0, 0, pathCanvas.width, pathCanvas.height);
   pathCtx.fillStyle = '#ffffff';
   pathCtx.textAlign = 'center';
   pathCtx.textBaseline = 'middle';
   pathCtx.font = '600 14px Google Sans Code, IBM Plex Mono,system-ui, -apple-system, Segoe UI, Roboto';
   pathCtx.fillText('Triangulation will appear here after you click “Generate”.', pathCanvas.width / 2, pathCanvas.height / 2);
}

// Render preview
function renderPreview() {
   if (!img) return;
   const w = prevCanvas.width, h = prevCanvas.height;
   prevCtx.fillStyle = '#121416b4';
   prevCtx.fillRect(0, 0, w, h);
   const { bright, contrast, saturate, blur, invert, gamma } = ui;
   prevCtx.filter = `brightness(${bright.value}) contrast(${contrast.value}) saturate(${saturate.value}) blur(${blur.value}px)` + (invert.value === '1' ? ' invert(1)' : '');
   const fit = fitContain(img.width, img.height, w, h);
   lastFit = fit;
   prevCtx.drawImage(img, fit.dx, fit.dy, fit.dw, fit.dh);
   if (Math.abs(gamma.value - 1.0) > 1e-3 || saturate.value === 0) {
      const id = prevCtx.getImageData(0, 0, w, h);
      const d = id.data;
      const gInv = 1.0 / gamma.value;
      for (let i = 0; i < d.length; i += 4) {
         let r = d[i], g = d[i + 1], b = d[i + 2];
         if (Math.abs(gamma.value - 1.0) > 1e-3) {
            r = 255 * Math.pow(r / 255, gInv);
            g = 255 * Math.pow(g / 255, gInv);
            b = 255 * Math.pow(b / 255, gInv);
         }
         if (saturate.value === 0) {
            const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            r = g = b = luma;
         }
         d[i] = r;
         d[i + 1] = g;
         d[i + 2] = b;
      }
      prevCtx.putImageData(id, 0, 0);
   }
   ui.dropHint.style.display = 'none';
}

// File handling
function handleFile(file) {
   const url = URL.createObjectURL(file);
   const im = new Image();
   im.onload = () => {
      if (im.width <= 0 || im.height <= 0) {
         alert('Invalid image dimensions.');
         URL.revokeObjectURL(url);
         return;
      }
      // Clear previous image and triangulation
      img = null;
      triangleCanvas = null;
      prevCtx.clearRect(0, 0, prevCanvas.width, prevCanvas.height);
      pathCtx.clearRect(0, 0, pathCanvas.width, pathCanvas.height);
      drawPathPlaceholder();
      img = im;
      URL.revokeObjectURL(url);
      ui.generateBtn.disabled = false;
      ui.exportBtn.disabled = true;
      ui.exportPngBtn.disabled = true;
      renderPreview();
      sizeStages();
   };
   im.onerror = () => {
      alert('Could not load image.');
      URL.revokeObjectURL(url);
   };
   im.src = url;
}

// Generate triangles
async function generateTriangles() {
   if (!img) return;
   ui.progressWrap.style.display = '';
   updateProgress(0);
   await nextFrame();

   const config = {
      image: img,
      resolution: parseInt(ui.exportW.value) || null,
      outputResolution: parseInt(ui.exportW.value) || null,
      preprocess: {
         brightness: parseFloat(ui.bright.value) || 1.0,
         contrast: parseFloat(ui.contrast.value) || 1.0,
         saturation: parseFloat(ui.saturate.value) || 1.0,
         blur: parseFloat(ui.blur.value) || 0,
         invert: ui.invert.value === '1',
         gamma: parseFloat(ui.gamma.value) || 1.0,
         densityMode: ui.densityMode.value || 'luma',
         edgeBoost: parseFloat(ui.edgeBoost.value) || 0
      },
      settings: {
         points: parseInt(ui.points.value) || 2600,
         darkStrength: parseFloat(ui.darkStrength.value) || 4.1,
         minDist: parseFloat(ui.minDist.value) || 8,
         edgeSamples: parseInt(ui.edgeSamples.value) || 20,
         showWires: ui.showWires.value === '1',
         wireColor: ui.wireColor.value,
         wireWidth: ui.wireWidth.value,
         adjustment: parseInt(ui.adjustment.value) || 30,
         seed: parseInt(ui.seed.value) || 0
      },
      format: 'canvas',
      onProgress: (pct) => updateProgress(pct)
   };

   triangleCanvas = await ImageToTriangle.triangulate(config);
   pathCtx.clearRect(0, 0, pathCanvas.width, pathCanvas.height);
   const fit = fitContain(img.width, img.height, pathCanvas.width, pathCanvas.height);
   pathCtx.drawImage(triangleCanvas, fit.dx, fit.dy, fit.dw, fit.dh);
   ui.exportBtn.disabled = false;
   ui.exportPngBtn.disabled = false;
   setTimeout(() => ui.progressWrap.style.display = 'none', 250);
}

// Export SVG
async function exportSVG() {
   if (!triangleCanvas) return;
   const config = {
      image: img,
      resolution: parseInt(ui.exportW.value) || 1200,
      outputResolution: parseInt(ui.exportW.value) || 1200,
      preprocess: {
         brightness: parseFloat(ui.bright.value) || 1.0,
         contrast: parseFloat(ui.contrast.value) || 1.0,
         saturation: parseFloat(ui.saturate.value) || 1.0,
         blur: parseFloat(ui.blur.value) || 0,
         invert: ui.invert.value === '1',
         gamma: parseFloat(ui.gamma.value) || 1.0,
         densityMode: ui.densityMode.value || 'luma',
         edgeBoost: parseFloat(ui.edgeBoost.value) || 0
      },
      settings: {
         points: parseInt(ui.points.value) || 2600,
         darkStrength: parseFloat(ui.darkStrength.value) || 4.1,
         minDist: parseFloat(ui.minDist.value) || 8,
         edgeSamples: parseInt(ui.edgeSamples.value) || 20,
         showWires: ui.showWires.value === '1',
         wireColor: ui.wireColor.value,
         wireWidth: ui.wireWidth.value,
         adjustment: parseInt(ui.adjustment.value) || 30,
         seed: parseInt(ui.seed.value) || 0
      },
      format: 'svg',
      onProgress: (pct) => updateProgress(pct)
   };

   const svg = await ImageToTriangle.triangulate(config);
   const blob = new Blob([svg], { type: 'image/svg+xml' });
   const a = document.createElement('a');
   a.href = URL.createObjectURL(blob);
   a.download = 'triangulated.svg';
   a.click();
   URL.revokeObjectURL(a.href);
}

async function exportPNG() {
   if (!triangleCanvas) return;
   const blob = await new Promise(resolve => triangleCanvas.toBlob(resolve, 'image/png'));
   const a = document.createElement('a');
   a.href = URL.createObjectURL(blob);
   a.download = 'triangulated.png';
   a.click();
   URL.revokeObjectURL(a.href);
}
// Size stages
function sizeStages() {
   const pw = ui.previewStage.clientWidth, ph = ui.previewStage.clientHeight;
   if (pw !== lastPreviewSize.w || ph !== lastPreviewSize.h) {
      prevCanvas.width = pw;
      prevCanvas.height = ph;
      lastPreviewSize = { w: pw, h: ph };
      img ? renderPreview() : drawPreviewPlaceholder();
   }

   const cw = ui.pathStage.clientWidth, ch = ui.pathStage.clientHeight;
   let canvasW = cw, canvasH = ch;
   if (img && img.width > 0 && img.height > 0) {
      const imgAspect = img.width / img.height;
      if (cw / ch > imgAspect) {
         canvasH = ch;
         canvasW = Math.round(ch * imgAspect);
      } else {
         canvasW = cw;
         canvasH = Math.round(cw / imgAspect);
      }
   }
   pathCanvas.width = canvasW;
   pathCanvas.height = canvasH;
   if (triangleCanvas) {
      pathCtx.clearRect(0, 0, canvasW, canvasH);
      const fit = fitContain(img.width, img.height, canvasW, canvasH);
      pathCtx.drawImage(triangleCanvas, fit.dx, fit.dy, fit.dw, fit.dh);
   } else {
      drawPathPlaceholder();
   }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
   prevCanvas = document.getElementById('previewCanvas');
   prevCtx = prevCanvas.getContext('2d', { willReadFrequently: true });
   pathCanvas = document.getElementById('pathCanvas');
   pathCtx = pathCanvas.getContext('2d');
   ui.previewStage = document.getElementById('previewStage');
   ui.pathStage = document.getElementById('pathStage');
   ui.dropHint = document.getElementById('dropHint');
   ui.file = document.getElementById('file');
   ui.exportW = document.getElementById('exportW');
   ui.bright = document.getElementById('bright');
   ui.brightNum = document.getElementById('brightNum');
   ui.contrast = document.getElementById('contrast');
   ui.contrastNum = document.getElementById('contrastNum');
   ui.gamma = document.getElementById('gamma');
   ui.gammaNum = document.getElementById('gammaNum');
   ui.saturate = document.getElementById('saturate');
   ui.saturateNum = document.getElementById('saturateNum');
   ui.blur = document.getElementById('blur');
   ui.blurNum = document.getElementById('blurNum');
   ui.invert = document.getElementById('invert');
   ui.densityMode = document.getElementById('densityMode');
   ui.edgeBoost = document.getElementById('edgeBoost');
   ui.edgeBoostNum = document.getElementById('edgeBoostNum');
   ui.points = document.getElementById('points');
   ui.pointsNum = document.getElementById('pointsNum');
   ui.darkStrength = document.getElementById('darkStrength');
   ui.darkStrengthNum = document.getElementById('darkStrengthNum');
   ui.minDist = document.getElementById('minDist');
   ui.minDistNum = document.getElementById('minDistNum');
   ui.edgeSamples = document.getElementById('edgeSamples');
   ui.edgeSamplesNum = document.getElementById('edgeSamplesNum');
   ui.showWires = document.getElementById('showWires');
   ui.wireColor = document.getElementById('wireColor');
   ui.wireWidth = document.getElementById('wireWidth');
   ui.wireWidthNum = document.getElementById('wireWidthNum');
   ui.adjustment = document.getElementById('adjustment');
   ui.adjustmentNum = document.getElementById('adjustmentNum');
   ui.seed = document.getElementById('seed');
   ui.seedNum = document.getElementById('seedNum');
   ui.generateBtn = document.getElementById('generateBtn');
   ui.exportBtn = document.getElementById('exportBtn');
   ui.progressWrap = document.getElementById('progressWrap');
   ui.progressBar = document.getElementById('progressBar');
   ui.progressText = document.getElementById('progressText');
   ui.exportPngBtn = document.getElementById('exportPngBtn');

   // Link input fields
   [
      [ui.bright, ui.brightNum],
      [ui.contrast, ui.contrastNum],
      [ui.gamma, ui.gammaNum],
      [ui.saturate, ui.saturateNum],
      [ui.blur, ui.blurNum],
      [ui.edgeBoost, ui.edgeBoostNum],
      [ui.points, ui.pointsNum],
      [ui.darkStrength, ui.darkStrengthNum],
      [ui.minDist, ui.minDistNum],
      [ui.edgeSamples, ui.edgeSamplesNum],
      [ui.adjustment, ui.adjustmentNum],
      [ui.wireWidth, ui.wireWidthNum],
      [ui.seed, ui.seedNum]
   ].forEach(([a, b]) => link(a, b));

   // Events
   ui.file.addEventListener('change', onFile);
   ui.generateBtn.addEventListener('click', generateTriangles);
   ui.exportBtn.addEventListener('click', exportSVG);
   ui.exportPngBtn.addEventListener('click', exportPNG);

   const live = debounce(() => {
      if (!img) return;
      renderPreview();
      if (triangleCanvas) {
         pathCtx.clearRect(0, 0, pathCanvas.width, pathCanvas.height);
         const fit = fitContain(img.width, img.height, pathCanvas.width, pathCanvas.height);
         pathCtx.drawImage(triangleCanvas, fit.dx, fit.dy, fit.dw, fit.dh);
      }
   }, 20);
   ['input', 'change'].forEach(evt => {
      ['bright', 'brightNum', 'contrast', 'contrastNum', 'gamma', 'gammaNum',
         'saturate', 'saturateNum', 'blur', 'blurNum', 'invert', 'densityMode',
         'adjustment', 'adjustmentNum', 'wireWidthNum'].forEach(id =>
            document.getElementById(id).addEventListener(evt, live)
         );
   });

   ui.showWires.addEventListener('change', () => {
      ui.wireColor.disabled = ui.showWires.value !== '1';
      if (img && triangleCanvas && ui.showWires.value === '1') {
         generateTriangles();
      }
   });

   const updateWireColorDebounced = debounce(generateTriangles, 20);
   ui.wireColor.addEventListener('input', () => {
      if (img && triangleCanvas && ui.showWires.value === '1') {
         updateWireColorDebounced();
      }
   });

   const onResize = debounce(sizeStages, 40);
   window.addEventListener('resize', onResize);

   // Drag-and-drop event listeners
   ['dragenter', 'dragover'].forEach(ev => {
      ui.previewStage.addEventListener(ev, e => {
         e.preventDefault();
         ui.dropHint.textContent = 'Release to load image';
      });
   });
   ['dragleave', 'drop'].forEach(ev => {
      ui.previewStage.addEventListener(ev, e => {
         e.preventDefault();
         ui.dropHint.textContent = 'Drop an image here, or use the file picker.';
         if (ev === 'drop' && e.dataTransfer?.files?.[0]) {
            handleFile(e.dataTransfer.files[0]);
         }
      });
   });

   function onFile(e) {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
   }
   setTimeout(() => sizeStages(), 200);

});