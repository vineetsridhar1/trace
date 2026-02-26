# Project Notes

## Icon Library
This project uses `react-icons` for UI icons. All icons should be imported from the
Feather icons set (`react-icons/fi`) to maintain visual consistency. Example:

```tsx
import { FiMap, FiSend } from 'react-icons/fi';
```

Inline SVGs that existed before the migration are being replaced over time.

## GraphQL Workflow
Never use `useApolloClient`. All GraphQL operations must use the auto-generated hooks.

1. Define your `gql` query/mutation in the source file (e.g. `src/hooks/useMessages.ts`)
2. Run `make gql` to regenerate types and hooks
3. Import and use the generated hooks from `__generated__/*.generated.ts`:
   - `useXxxQuery` — declarative queries that run on render
   - `useXxxLazyQuery` — imperative queries you call on-demand in callbacks
   - `useXxxMutation` — mutations

```tsx
// In your source file, define the gql operation:
const GQL_MESSAGES = gql`query Messages(...) { ... }`;

// Then import and use the generated hook:
import { useMessagesLazyQuery } from './__generated__/useMessages.generated';
const [executeMessages] = useMessagesLazyQuery();
const { data } = await executeMessages({ variables: { ... } });
```
