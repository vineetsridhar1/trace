import { GraphQLScalarType, Kind, type ValueNode } from "graphql";

export const DateTimeScalar = new GraphQLScalarType({
  name: "DateTime",
  description: "ISO 8601 date-time string",
  serialize: (value) => (value instanceof Date ? value.toISOString() : value),
  parseValue: (value) => new Date(value as string),
  parseLiteral: (ast) => (ast.kind === Kind.STRING ? new Date(ast.value) : null),
});

export const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON value",
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: parseLiteralJSON,
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
        ast.fields.map((f) => [f.name.value, parseLiteralJSON(f.value)]),
      );
    case Kind.LIST:
      return ast.values.map(parseLiteralJSON);
    case Kind.NULL:
      return null;
    default:
      return null;
  }
}
