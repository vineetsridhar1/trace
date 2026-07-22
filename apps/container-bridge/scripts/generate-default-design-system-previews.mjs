import { writeFile } from "node:fs/promises";

// Deterministic valid PNG used for the bundled package's lightweight thumbnail.
// The self-contained HTML files remain the executable preview source; authored
// systems replace these thumbnails with full-page browser captures during review.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

for (const name of ["foundations.png", "components.png"]) {
  await writeFile(new URL(`../design-default-package/preview/${name}`, import.meta.url), png);
}
