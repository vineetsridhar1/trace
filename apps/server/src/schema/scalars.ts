import { GraphQLError, GraphQLScalarType, Kind, type ValueNode } from "graphql";

const ISO_8601 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})?$/;

function parseDateTime(value: unknown): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new GraphQLError("DateTime: invalid Date instance");
    }
    return value;
  }
  if (typeof value !== "string") {
    throw new GraphQLError("DateTime must be a string in ISO 8601 format");
  }
  if (!ISO_8601.test(value)) {
    throw new GraphQLError("DateTime must be an ISO 8601 timestamp");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new GraphQLError("DateTime: unparseable timestamp");
  }
  return parsed;
}

export const DateTimeScalar = new GraphQLScalarType({
  name: "DateTime",
  description: "ISO 8601 date-time string",
  serialize: (value: unknown) => (value instanceof Date ? value.toISOString() : value),
  parseValue: parseDateTime,
  parseLiteral: (ast: ValueNode) => {
    if (ast.kind !== Kind.STRING) {
      throw new GraphQLError("DateTime must be a string literal");
    }
    return parseDateTime(ast.value);
  },
});

const MAX_JSON_BYTES = 128 * 1024;

function enforceJsonSize(value: unknown): void {
  try {
    const serialized = JSON.stringify(value);
    if (serialized && serialized.length > MAX_JSON_BYTES) {
      throw new GraphQLError(`JSON value exceeds ${MAX_JSON_BYTES} bytes`);
    }
  } catch (err) {
    if (err instanceof GraphQLError) throw err;
    throw new GraphQLError("JSON value could not be serialized");
  }
}

export const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON value (size-limited)",
  serialize: (value: unknown) => value,
  parseValue: (value: unknown) => {
    enforceJsonSize(value);
    return value;
  },
  parseLiteral: (ast) => {
    const parsed = parseLiteralJSON(ast);
    enforceJsonSize(parsed);
    return parsed;
  },
});

function parseLiteralJSON(ast: ValueNode): unknown {
  switch (ast.kind) {
    case Kind.STRING:
      return ast.value;
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
      return parseInt(ast.value, 10);
    case Kind.FLOAT:
      return parseFloat(ast.value);
    case Kind.OBJECT:
      return Object.fromEntries(
        ast.fields.map((f: { name: { value: string }; value: ValueNode }) => [
          f.name.value,
          parseLiteralJSON(f.value),
        ]),
      );
    case Kind.LIST:
      return ast.values.map(parseLiteralJSON);
    case Kind.NULL:
      return null;
    default:
      return null;
  }
}
