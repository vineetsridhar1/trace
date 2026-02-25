import { ApolloProvider } from '@apollo/client';
import { graphqlClient } from './client';
import type { ReactNode } from 'react';

export function GraphQLProvider({ children }: { children: ReactNode }) {
  return <ApolloProvider client={graphqlClient}>{children}</ApolloProvider>;
}
