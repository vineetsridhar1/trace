import { Client, cacheExchange, fetchExchange } from 'urql';
import { SERVER_URL } from '../types';

export const graphqlClient = new Client({
  url: `${SERVER_URL}/graphql`,
  exchanges: [cacheExchange, fetchExchange],
});
