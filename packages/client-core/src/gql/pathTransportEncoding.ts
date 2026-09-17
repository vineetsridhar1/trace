const PATH_TRANSPORT_PREFIX = "\u0000trace-path-v1:";

function encodeString(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let encoded = "";
  for (const byte of bytes) encoded += byte.toString(16).padStart(2, "0");
  return `${PATH_TRANSPORT_PREFIX}${encoded}`;
}

function encodeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.includes("../") || value.includes("..\\") ? encodeString(value) : value;
  }
  if (Array.isArray(value)) return value.map(encodeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
  }
  return value;
}

/**
 * Encodes path-traversal-looking GraphQL variables so edge WAFs do not mistake
 * ordinary source paths in messages for an HTTP path traversal attack.
 */
export function encodePathVariables(body: string): string {
  try {
    const request = JSON.parse(body) as { variables?: unknown };
    if (!request.variables) return body;
    return JSON.stringify({ ...request, variables: encodeValue(request.variables) });
  } catch {
    return body;
  }
}
