export type FeedbackDestination = {
  sessionId: string | null;
  label: string;
  context: string | null;
  branch: string | null;
};

export type FeedbackScreenshot = {
  dataUrl: string;
  width: number;
  height: number;
};

export function getFeedbackOverlayHtml(destination: FeedbackDestination | null) {
  const destinationJson = JSON.stringify(
    destination ?? {
      sessionId: null,
      label: "No session selected",
      context: null,
      branch: null,
    },
  ).replace(/</g, "\\u003c");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' data:; script-src 'unsafe-inline'; img-src data:; style-src 'unsafe-inline';" />
    <title>Trace Feedback</title>
    <style>
      * {
        box-sizing: border-box;
      }

      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: transparent;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #f8fafc;
        user-select: none;
      }

      body {
        cursor: crosshair;
      }

      canvas {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
      }

      #screenshot {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        object-fit: fill;
        pointer-events: none;
      }

      .panel {
        position: fixed;
        left: 50%;
        bottom: 24px;
        width: min(720px, calc(100vw - 32px));
        transform: translateX(-50%);
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        padding: 12px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.88);
        box-shadow: 0 20px 80px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(16px);
        cursor: default;
      }

      .destination {
        grid-column: 1 / -1;
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border: 1px solid rgba(52, 211, 153, 0.25);
        border-radius: 8px;
        background: rgba(6, 78, 59, 0.58);
      }

      .destination-icon {
        display: grid;
        width: 30px;
        height: 30px;
        flex: 0 0 auto;
        place-items: center;
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.12);
      }

      .destination-copy {
        min-width: 0;
      }

      .eyebrow {
        margin: 0;
        color: rgba(255, 255, 255, 0.58);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .destination-title {
        margin: 1px 0 0;
        overflow: hidden;
        color: #ecfdf5;
        font-size: 13px;
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .destination-meta {
        margin: 2px 0 0;
        overflow: hidden;
        color: rgba(255, 255, 255, 0.66);
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      textarea {
        width: 100%;
        min-height: 78px;
        resize: none;
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: 8px;
        outline: none;
        padding: 10px 12px;
        background: rgba(15, 23, 42, 0.9);
        color: #f8fafc;
        font: inherit;
        font-size: 14px;
        user-select: text;
      }

      textarea::placeholder {
        color: rgba(226, 232, 240, 0.5);
      }

      .actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      button {
        min-width: 104px;
        height: 36px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: 8px;
        padding: 0 12px;
        background: rgba(15, 23, 42, 0.75);
        color: #f8fafc;
        font: inherit;
        font-size: 13px;
        font-weight: 650;
        cursor: pointer;
      }

      button:hover {
        background: rgba(30, 41, 59, 0.9);
      }

      button.primary {
        border-color: rgba(20, 184, 166, 0.8);
        background: #0f766e;
      }

      button.primary:hover {
        background: #0d9488;
      }

      button:disabled {
        opacity: 0.55;
        cursor: wait;
      }

      .hint {
        position: fixed;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        padding: 7px 10px;
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.72);
        color: rgba(248, 250, 252, 0.82);
        font-size: 12px;
        backdrop-filter: blur(12px);
        pointer-events: none;
      }

      .capture-mode canvas,
      .capture-mode .panel,
      .capture-mode .hint {
        opacity: 0;
      }
    </style>
  </head>
  <body>
    <img id="screenshot" alt="" />
    <canvas id="canvas"></canvas>
    <div class="hint">Draw anywhere. Press Escape to cancel.</div>
    <section class="panel" id="panel">
      <div class="destination">
        <div class="destination-icon">↗</div>
        <div class="destination-copy">
          <p class="eyebrow">Feedback will be sent to</p>
          <p class="destination-title" id="destinationTitle"></p>
          <p class="destination-meta" id="destinationMeta"></p>
        </div>
      </div>
      <textarea id="message" placeholder="What should the agent know about this feedback?"></textarea>
      <div class="actions">
        <button id="undo" type="button">Undo</button>
        <button id="clear" type="button">Clear</button>
        <button id="send" class="primary" type="button">Send</button>
        <button id="cancel" type="button">Cancel</button>
      </div>
    </section>
    <script>
      const destination = ${destinationJson};
      let screenshot = null;
      const screenshotImage = document.getElementById("screenshot");
      const canvas = document.getElementById("canvas");
      const context = canvas.getContext("2d");
      const message = document.getElementById("message");
      const send = document.getElementById("send");
      const undo = document.getElementById("undo");
      const clear = document.getElementById("clear");
      const cancel = document.getElementById("cancel");
      const destinationTitle = document.getElementById("destinationTitle");
      const destinationMeta = document.getElementById("destinationMeta");
      const strokes = [];
      let activeStroke = null;
      let sending = false;

      destinationTitle.textContent = destination.label || "No session selected";
      destinationMeta.textContent = [destination.context, destination.branch].filter(Boolean).join(" · ");
      destinationMeta.style.display = destinationMeta.textContent ? "block" : "none";

      async function loadInitialScreenshot() {
        screenshot = await window.trace.getFeedbackOverlayScreenshot();
        if (!screenshot) {
          throw new Error("Screenshot is not ready");
        }
        screenshotImage.src = screenshot.dataUrl;
      }

      function resizeCanvas() {
        const scale = window.devicePixelRatio || 1;
        canvas.width = Math.round(window.innerWidth * scale);
        canvas.height = Math.round(window.innerHeight * scale);
        context.setTransform(scale, 0, 0, scale, 0, 0);
        redraw();
      }

      function drawStroke(stroke) {
        if (stroke.points.length < 2) return;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 6;
        context.strokeStyle = "#ef4444";
        context.beginPath();
        context.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (const point of stroke.points.slice(1)) {
          context.lineTo(point.x, point.y);
        }
        context.stroke();
      }

      function redraw() {
        context.clearRect(0, 0, window.innerWidth, window.innerHeight);
        for (const stroke of strokes) drawStroke(stroke);
        if (activeStroke) drawStroke(activeStroke);
      }

      function getPoint(event) {
        return { x: event.clientX, y: event.clientY };
      }

      window.addEventListener("resize", resizeCanvas);
      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") window.trace.closeFeedbackOverlay();
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
          strokes.pop();
          redraw();
        }
      });

      canvas.addEventListener("pointerdown", (event) => {
        if (sending) return;
        activeStroke = { points: [getPoint(event)] };
        canvas.setPointerCapture(event.pointerId);
        redraw();
      });

      canvas.addEventListener("pointermove", (event) => {
        if (!activeStroke || sending) return;
        activeStroke.points.push(getPoint(event));
        redraw();
      });

      function finishStroke() {
        if (!activeStroke) return;
        if (activeStroke.points.length > 1) strokes.push(activeStroke);
        activeStroke = null;
        redraw();
      }

      canvas.addEventListener("pointerup", finishStroke);
      canvas.addEventListener("pointercancel", finishStroke);
      undo.addEventListener("click", () => {
        strokes.pop();
        redraw();
      });
      clear.addEventListener("click", () => {
        strokes.length = 0;
        redraw();
      });
      cancel.addEventListener("click", () => window.trace.closeFeedbackOverlay());

      function loadImage(src) {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("Failed to load capture image"));
          image.src = src;
        });
      }

      async function mergeCapture(screenshot, annotationDataUrl) {
        const [screenshotImage, annotationImage] = await Promise.all([
          loadImage(screenshot.dataUrl),
          loadImage(annotationDataUrl),
        ]);
        const output = document.createElement("canvas");
        output.width = screenshot.width;
        output.height = screenshot.height;
        const outputContext = output.getContext("2d");
        outputContext.drawImage(screenshotImage, 0, 0, screenshot.width, screenshot.height);
        outputContext.drawImage(annotationImage, 0, 0, screenshot.width, screenshot.height);

        return {
          dataUrl: output.toDataURL("image/png"),
          width: screenshot.width,
          height: screenshot.height,
        };
      }

      send.addEventListener("click", async () => {
        if (sending) return;
        if (!screenshot) {
          alert("Screenshot is not ready");
          return;
        }
        sending = true;
        send.disabled = true;
        send.textContent = "Sending...";
        const annotationDataUrl = canvas.toDataURL("image/png");
        document.body.classList.add("capture-mode");
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        try {
          const mergedScreenshot = await mergeCapture(screenshot, annotationDataUrl);
          await window.trace.submitFeedbackOverlay({
            message: message.value,
            screenshot: mergedScreenshot,
          });
        } catch (error) {
          document.body.classList.remove("capture-mode");
          send.disabled = false;
          send.textContent = "Send";
          sending = false;
          alert(error instanceof Error ? error.message : "Failed to capture feedback");
        }
      });

      loadInitialScreenshot()
        .then(() => {
          resizeCanvas();
          setTimeout(() => message.focus(), 100);
        })
        .catch((error) => {
          alert(error instanceof Error ? error.message : "Failed to load feedback screenshot");
          window.trace.closeFeedbackOverlay();
        });
    </script>
  </body>
</html>`;
}
