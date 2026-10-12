import { ApolloClient, HttpLink, InMemoryCache, from } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';

export const TOKEN_KEY = 'devhub-token';

const httpLink = new HttpLink({
  uri: import.meta.env.VITE_GRAPHQL_URL || '/graphql',
});

const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem(TOKEN_KEY);

  return {
    headers: {
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
});

const authErrorLink = onError(({ error }) => {
  if (!CombinedGraphQLErrors.is(error)) return;

  const unauthenticated = error.errors.some(
    (graphQLError) => graphQLError.extensions?.code === 'UNAUTHENTICATED',
  );

  if (unauthenticated) {
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event('devhub:unauthorized'));
  }
});

export const apolloClient = new ApolloClient({
  link: from([authErrorLink, authLink, httpLink]),
  cache: new InMemoryCache({
    typePolicies: {
      Issue: {
        fields: {
          activity: { merge: false },
          comments: { merge: false },
          labels: { merge: false },
        },
      },
    },
  }),
});
