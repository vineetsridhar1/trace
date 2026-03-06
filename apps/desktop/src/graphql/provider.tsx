import { ApolloProvider } from '@apollo/client';
import { useMemo } from 'react';
import { createGraphqlClient } from './client';
import type { ReactNode } from 'react';

export function GraphQLProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => createGraphqlClient(), []);
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
