import { GraphQLScalarType, Kind } from "graphql";

const DateTimeScalar = new GraphQLScalarType({
  name: "DateTime",
  description: "ISO 8601 date-time string",
  serialize: (value) => (value instanceof Date ? value.toISOString() : value),
  parseValue: (value) => new Date(value as string),
  parseLiteral: (ast) => (ast.kind === Kind.STRING ? new Date(ast.value) : null),
});

const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON value",
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: parseLiteralJSON,
});

function parseLiteralJSON(ast: any): unknown {
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
        ast.fields.map((f: any) => [f.name.value, parseLiteralJSON(f.value)]),
      );
    case Kind.LIST:
      return ast.values.map(parseLiteralJSON);
    case Kind.NULL:
      return null;
    default:
      return null;
  }
}

// Stub resolvers — all return placeholder data or throw "not implemented"
const stub = () => {
  throw new Error("Not implemented");
};

export const resolvers = {
  DateTime: DateTimeScalar,
  JSON: JSONScalar,

  Query: {
    organization: stub,
    repos: stub,
    repo: stub,
    projects: stub,
    project: stub,
    channels: stub,
    channel: stub,
    sessions: stub,
    session: stub,
    mySessions: stub,
    tickets: stub,
    ticket: stub,
    events: stub,
  },

  Mutation: {
    createChannel: stub,
    sendMessage: stub,
    startSession: stub,
    pauseSession: stub,
    resumeSession: stub,
    terminateSession: stub,
    sendSessionMessage: stub,
    createTicket: stub,
    updateTicket: stub,
    commentOnTicket: stub,
    linkSessionToTicket: stub,
    linkEntityToProject: stub,
    createRepo: stub,
    createProject: stub,
  },

  Subscription: {
    channelEvents: { subscribe: stub },
    sessionEvents: { subscribe: stub },
    ticketEvents: { subscribe: stub },
    userNotifications: { subscribe: stub },
    sessionPortsChanged: { subscribe: stub },
    sessionStatusChanged: { subscribe: stub },
  },
};
