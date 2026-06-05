const MAX_PATH_PREVIEW_LENGTH = 56;
const PATH_PREVIEW_MARKER = "/.../";

export function truncatePathMiddle(path: string) {
  if (path.length <= MAX_PATH_PREVIEW_LENGTH) return path;

  const budget = MAX_PATH_PREVIEW_LENGTH - PATH_PREVIEW_MARKER.length;
  const headLength = Math.ceil(budget / 2);
  const tailLength = Math.floor(budget / 2);

  return `${path.slice(0, headLength)}${PATH_PREVIEW_MARKER}${path.slice(-tailLength)}`;
}
