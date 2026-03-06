declare module 'graphql-ws/use/ws' {
  import { GraphQLSchema, ExecutionResult } from 'graphql';
  import { WebSocketServer } from 'ws';

  interface Context {
    [key: string]: unknown;
  }

  interface ServerOptions {
    schema: GraphQLSchema;
    context?: Context | ((ctx: unknown) => Context | Promise<Context>);
    onConnect?: (ctx: unknown) => boolean | void | Promise<boolean | void>;
    onDisconnect?: (ctx: unknown) => void | Promise<void>;
    onSubscribe?: (ctx: unknown, message: unknown) => ExecutionResult | void | Promise<ExecutionResult | void>;
  }

  interface Disposable {
    dispose: () => Promise<void>;
  }

  export function useServer(options: ServerOptions, server: WebSocketServer): Disposable;
}
