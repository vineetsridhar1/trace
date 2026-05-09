export type FeedbackDestination = {
  sessionId: string | null;
  label: string;
};

export type FeedbackScreenshot = {
  dataUrl: string;
  width: number;
  height: number;
};

export type FeedbackOverlaySubmitPayload = {
  screenshot: FeedbackScreenshot;
};

export function getFeedbackOverlayHtml() {
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

      .toolbar {
        position: fixed;
        top: 16px;
        right: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.86);
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.32);
        backdrop-filter: blur(14px);
        cursor: default;
      }

      .destination {
        max-width: min(360px, 46vw);
        overflow: hidden;
        padding: 0 8px;
        color: rgba(248, 250, 252, 0.78);
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      button {
        height: 32px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: 7px;
        padding: 0 11px;
        background: rgba(15, 23, 42, 0.72);
        color: #f8fafc;
        font: inherit;
        font-size: 13px;
        font-weight: 650;
        cursor: pointer;
      }

      button:hover {
        background: rgba(30, 41, 59, 0.92);
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
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        padding: 7px 10px;
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.72);
        color: rgba(248, 250, 252, 0.84);
        font-size: 12px;
        pointer-events: none;
        backdrop-filter: blur(12px);
      }

      .note {
        position: fixed;
        width: 220px;
        min-height: 44px;
        resize: none;
        border: 2px solid #ef4444;
        border-radius: 7px;
        outline: none;
        padding: 7px 8px;
        background: rgba(255, 255, 255, 0.94);
        color: #111827;
        font: inherit;
        font-size: 13px;
        line-height: 1.3;
        user-select: text;
        box-shadow: 0 10px 32px rgba(0, 0, 0, 0.22);
        cursor: text;
      }

      .note::placeholder {
        color: #6b7280;
      }

      .hidden {
        display: none;
      }
    </style>
  </head>
  <body>
    <canvas id="canvas"></canvas>
    <div class="hint">Drag to draw a box. Press Escape or Cmd+Shift+F to cancel.</div>
    <section class="toolbar">
      <div class="destination" id="destination">Feedback will be sent to the current session</div>
      <button id="clear" type="button">Clear</button>
      <button id="cancel" type="button">Cancel</button>
      <button id="submit" class="primary" type="button" disabled>Submit</button>
    </section>
    <script>
      const canvas = document.getElementById("canvas");
      const context = canvas.getContext("2d");
      const destination = document.getElementById("destination");
      const clearButton = document.getElementById("clear");
      const cancelButton = document.getElementById("cancel");
      const submitButton = document.getElementById("submit");

      let screenshot = null;
      let screenshotImage = null;
      let annotations = [];
      let draft = null;
      let nextAnnotationId = 1;
      let submitting = false;

      function resizeCanvas() {
        const scale = window.devicePixelRatio || 1;
        canvas.width = Math.round(window.innerWidth * scale);
        canvas.height = Math.round(window.innerHeight * scale);
        context.setTransform(scale, 0, 0, scale, 0, 0);
        redraw();
      }

      function normalizeRect(start, end) {
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const width = Math.abs(end.x - start.x);
        const height = Math.abs(end.y - start.y);
        return { x, y, width, height };
      }

      function drawBox(rect) {
        context.save();
        context.strokeStyle = "#ef4444";
        context.lineWidth = 3;
        context.setLineDash([]);
        context.fillStyle = "rgba(239, 68, 68, 0.08)";
        context.fillRect(rect.x, rect.y, rect.width, rect.height);
        context.strokeRect(rect.x, rect.y, rect.width, rect.height);
        context.restore();
      }

      function redraw() {
        context.clearRect(0, 0, window.innerWidth, window.innerHeight);
        for (const annotation of annotations) drawBox(annotation.rect);
        if (draft) drawBox(normalizeRect(draft.start, draft.current));
      }

      function getPoint(event) {
        return { x: event.clientX, y: event.clientY };
      }

      function placeNote(note, rect) {
        const margin = 8;
        const preferredLeft = rect.x + rect.width + margin;
        const preferredTop = rect.y;
        const fallbackLeft = Math.max(margin, rect.x - note.offsetWidth - margin);
        const maxLeft = window.innerWidth - note.offsetWidth - margin;
        const maxTop = window.innerHeight - note.offsetHeight - margin;
        const left = preferredLeft <= maxLeft ? preferredLeft : fallbackLeft;
        note.style.left = Math.max(margin, Math.min(left, maxLeft)) + "px";
        note.style.top = Math.max(margin, Math.min(preferredTop, maxTop)) + "px";
      }

      function createNote(annotation) {
        const note = document.createElement("textarea");
        note.className = "note";
        note.placeholder = "Feedback";
        note.dataset.annotationId = String(annotation.id);
        note.addEventListener("input", () => {
          annotation.text = note.value;
        });
        note.addEventListener("pointerdown", (event) => event.stopPropagation());
        document.body.appendChild(note);
        placeNote(note, annotation.rect);
        note.focus();
      }

      function clearAnnotations() {
        annotations = [];
        draft = null;
        document.querySelectorAll(".note").forEach((node) => node.remove());
        redraw();
      }

      function loadImage(src) {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("Failed to load screenshot"));
          image.src = src;
        });
      }

      function wrapText(context, text, maxWidth) {
        const words = text.trim().split(/\\s+/).filter(Boolean);
        const lines = [];
        let line = "";
        for (const word of words) {
          const nextLine = line ? line + " " + word : word;
          if (context.measureText(nextLine).width <= maxWidth || !line) {
            line = nextLine;
          } else {
            lines.push(line);
            line = word;
          }
        }
        if (line) lines.push(line);
        return lines.length ? lines : ["Feedback"];
      }

      function drawTextBox(outputContext, annotation, scaleX, scaleY) {
        const noteWidth = 220 * scaleX;
        const padding = 8 * scaleX;
        const lineHeight = 18 * scaleY;
        const text = annotation.text.trim() || "Feedback";
        outputContext.font = Math.max(12, 13 * scaleY) + "px sans-serif";
        const lines = wrapText(outputContext, text, noteWidth - padding * 2);
        const noteHeight = Math.max(44 * scaleY, padding * 2 + lines.length * lineHeight);
        const margin = 8 * scaleX;
        const preferredLeft = (annotation.rect.x + annotation.rect.width) * scaleX + margin;
        const fallbackLeft = annotation.rect.x * scaleX - noteWidth - margin;
        const maxLeft = screenshot.width - noteWidth - margin;
        const left = preferredLeft <= maxLeft ? preferredLeft : Math.max(margin, fallbackLeft);
        const top = Math.max(margin, Math.min(annotation.rect.y * scaleY, screenshot.height - noteHeight - margin));

        outputContext.save();
        outputContext.fillStyle = "rgba(255, 255, 255, 0.95)";
        outputContext.strokeStyle = "#ef4444";
        outputContext.lineWidth = Math.max(2, 2 * scaleX);
        outputContext.beginPath();
        outputContext.roundRect(left, top, noteWidth, noteHeight, 7 * scaleX);
        outputContext.fill();
        outputContext.stroke();
        outputContext.fillStyle = "#111827";
        for (let index = 0; index < lines.length; index += 1) {
          outputContext.fillText(lines[index], left + padding, top + padding + lineHeight * (index + 0.78));
        }
        outputContext.restore();
      }

      async function buildAnnotatedScreenshot() {
        if (!screenshot || !screenshotImage) throw new Error("Screenshot is not ready");

        const output = document.createElement("canvas");
        output.width = screenshot.width;
        output.height = screenshot.height;
        const outputContext = output.getContext("2d");
        const scaleX = screenshot.width / window.innerWidth;
        const scaleY = screenshot.height / window.innerHeight;

        outputContext.drawImage(screenshotImage, 0, 0, screenshot.width, screenshot.height);
        for (const annotation of annotations) {
          const rect = annotation.rect;
          outputContext.save();
          outputContext.strokeStyle = "#ef4444";
          outputContext.lineWidth = Math.max(4, 3 * scaleX);
          outputContext.fillStyle = "rgba(239, 68, 68, 0.08)";
          outputContext.fillRect(rect.x * scaleX, rect.y * scaleY, rect.width * scaleX, rect.height * scaleY);
          outputContext.strokeRect(rect.x * scaleX, rect.y * scaleY, rect.width * scaleX, rect.height * scaleY);
          outputContext.restore();
          drawTextBox(outputContext, annotation, scaleX, scaleY);
        }

        return {
          dataUrl: output.toDataURL("image/png"),
          width: screenshot.width,
          height: screenshot.height,
        };
      }

      canvas.addEventListener("pointerdown", (event) => {
        if (submitting || event.button !== 0) return;
        draft = { start: getPoint(event), current: getPoint(event) };
        canvas.setPointerCapture(event.pointerId);
        redraw();
      });

      canvas.addEventListener("pointermove", (event) => {
        if (!draft || submitting) return;
        draft.current = getPoint(event);
        redraw();
      });

      function finishDraft(event) {
        if (!draft) return;
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
        const rect = normalizeRect(draft.start, draft.current);
        draft = null;
        if (rect.width >= 8 && rect.height >= 8) {
          const annotation = { id: nextAnnotationId++, rect, text: "" };
          annotations.push(annotation);
          createNote(annotation);
        }
        redraw();
      }

      canvas.addEventListener("pointerup", finishDraft);
      canvas.addEventListener("pointercancel", finishDraft);

      clearButton.addEventListener("click", clearAnnotations);
      cancelButton.addEventListener("click", () => window.trace.closeFeedbackOverlay());
      submitButton.addEventListener("click", async () => {
        if (submitting) return;
        if (annotations.length === 0) {
          window.trace.closeFeedbackOverlay();
          return;
        }
        submitting = true;
        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";
        try {
          const annotatedScreenshot = await buildAnnotatedScreenshot();
          await window.trace.submitFeedbackOverlay({ screenshot: annotatedScreenshot });
        } catch (error) {
          submitting = false;
          submitButton.disabled = false;
          submitButton.textContent = "Submit";
          alert(error instanceof Error ? error.message : "Failed to submit feedback");
        }
      });

      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") window.trace.closeFeedbackOverlay();
      });
      window.addEventListener("resize", () => {
        resizeCanvas();
        for (const annotation of annotations) {
          const note = document.querySelector("[data-annotation-id='" + annotation.id + "']");
          if (note) placeNote(note, annotation.rect);
        }
      });

      window.trace.onFeedbackOverlayInit(async (payload) => {
        try {
          screenshot = payload.screenshot;
          destination.textContent = payload.destination?.label
            ? "Feedback will be sent to " + payload.destination.label
            : "Feedback will be sent to the current session";
          screenshotImage = await loadImage(screenshot.dataUrl);
          resizeCanvas();
          submitButton.disabled = false;
          await window.trace.feedbackOverlayReady();
        } catch (error) {
          alert(error instanceof Error ? error.message : "Failed to prepare feedback overlay");
          window.trace.closeFeedbackOverlay();
        }
      });
    </script>
  </body>
</html>`;
}
