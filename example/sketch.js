// Find the code and run this project in codevre browser IDE;
// https://codevre.com/editor?project=7kR8qQoxNCVu1AwDEoqetvzkVGC3_20250815193557929_rl39

function setup() {
   // Set a fixed base width for your generative art canvas.
   // This controls the "analysis" size — keeping it constant ensures consistent
   // point layout and triangulation results regardless of screen size.
   // If you want dimension-agnostic outputs (e.g., generate at any size but keep the
   // same visual density and style), you can later change only the
   // `outputResolution` in triangulate() while keeping this baseWidth fixed.
   let baseWidth = 1200;

   // Maintain a 3:4 aspect  for the canvas.
   let aspectRatio = 3 / 4;

   // Create the main p5 canvas at the base analysis size.
   createCanvas(baseWidth, baseWidth / aspectRatio);

   // Fill background with a dark gray.
   background(24, 24, 26);

   // Remove outlines for shapes.
   noStroke();

   // Fixed random seed ensures repeatable generative patterns.
   randomSeed(8);
}


async function draw() {
   // -----------------------------
   // 1) Draw your generative art
   // -----------------------------
   // This is the source image that will be fed into the triangulation.
   // Because the random seed is fixed, this pattern will look the same every run.
   for (let i = 0; i < 200; i++) {
      let x = random(width);
      let y = random(height);
      let r = random(width / 20, width / 10);
      fill(random(360), random(255), random(255));
      ellipse(x, y, r, r);
   }

   // Prevent p5 from continuously looping draw()
   noLoop();

   // -----------------------------
   // 2) Set analysis & output sizes
   // -----------------------------
   // We’ll analyze at the current canvas width for consistent sampling.
   // The output can be any size — here we use the browser window width.
   let renderWidth = width - 1;

   // -----------------------------
   // 3) Run the triangulation
   // -----------------------------
   const resultCanvas = await ImageToTriangle.triangulate({
      // Use the current p5 canvas as the input image
      image: canvas,

      // "resolution" = sampling size for point placement & density analysis
      resolution: renderWidth,

      // "outputResolution" = final render size (aspect is taken from the input)
      outputResolution: floor(window.innerWidth),

      // Preprocessing settings to influence point density
      preprocess: {
         brightness: 1.0,          // overall brightness adjustment
         contrast: 1.0,            // overall contrast adjustment
         saturation: 1.0,          // color saturation adjustment
         densityMode: 'luma',      // how density is computed ('luma' = brightness)
         edgeBoost: 0.4            // boost density near edges
      },

      // Triangulation & style settings
      settings: {
         points: 2000,              // total number of points to place
         darkStrength: 2.5,            // bias toward dark areas (higher = more points there)
         minDist: 6,                // minimum spacing between points
         edgeSamples: 20,           // number of samples along each edge
         showWires: true,           // draw triangle outlines
         wireColor: '#ffffff',    // outline color
         wireWidth: 2,              // outline stroke width
         seed: randomSeed()         // fixed seed for repeatable point layout
      },

      // Output format ('canvas' returns an HTMLCanvasElement)
      format: 'canvas',

      // Optional: track progress in the console
      onProgress: (p) => console.log(`Progress: ${p}%`)
   });

   // -----------------------------
   // 4) Display the triangulated result
   // -----------------------------
   // Resize the main p5 canvas to match the triangulation output size
   // The "true" argument prevents p5 from clearing/redrawing automatically
   resizeCanvas(resultCanvas.width, resultCanvas.height, true);

   // Convert the triangulation canvas into a p5 image
   const img = createImage(resultCanvas.width, resultCanvas.height);
   img.drawingContext.drawImage(resultCanvas, 0, 0);

   // Draw it onto the p5 canvas
   image(img, 0, 0, width, height);
}
