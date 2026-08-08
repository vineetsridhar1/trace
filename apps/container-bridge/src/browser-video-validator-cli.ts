import { validateBrowserVideo } from "./browser-video-validator.js";

const file = process.argv[2];
const outputDirectory = process.env.TRACE_BROWSER_VIDEO_DIR;
if (!file || !outputDirectory) {
  process.stderr.write(
    "trace-browser-video-validate: usage: trace-browser-video-validate <video.webm>\n",
  );
  process.exit(2);
}

try {
  const metadata = await validateBrowserVideo(file, outputDirectory);
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`trace-browser-video-validate: ${message}\n`);
  process.exit(1);
}
