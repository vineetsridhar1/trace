const PATH_TRANSPORT_PREFIX = "\u0000trace-path-v1:";
const HEX_PATTERN = /^[0-9a-f]*$/;

function decodeValue(value: unknown): unknown {
  if (typeof value === "string" && value.startsWith(PATH_TRANSPORT_PREFIX)) {
    const encoded = value.slice(PATH_TRANSPORT_PREFIX.length);
    if (encoded.length % 2 === 0 && HEX_PATTERN.test(encoded)) {
      return Buffer.from(encoded, "hex").toString("utf8");
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(decodeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeValue(item)]));
  }
  return value;
}

/** Decode source-path variables encoded by the GraphQL client before Apollo validates them. */
export function decodePathVariables(body: unknown): void {
  if (!body || typeof body !== "object" || !("variables" in body)) return;
  const request = body as { variables?: unknown };
  if (request.variables) request.variables = decodeValue(request.variables);
}
