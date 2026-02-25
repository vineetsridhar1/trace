import { Provider } from 'urql';
import { graphqlClient } from './client';
import type { ReactNode } from 'react';

export function GraphQLProvider({ children }: { children: ReactNode }) {
  return <Provider value={graphqlClient}>{children}</Provider>;
}
