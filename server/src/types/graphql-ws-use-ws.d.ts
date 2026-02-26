declare module 'graphql-ws/use/ws' {
  import { GraphQLSchema } from 'graphql';
  import { WebSocketServer } from 'ws';

  interface ServerOptions {
    schema: GraphQLSchema;
  }

  interface Disposable {
    dispose: () => Promise<void>;
  }

  export function useServer(options: ServerOptions, server: WebSocketServer): Disposable;
}
