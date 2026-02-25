import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: './server/src/schema/schema.generated.graphqls',
  documents: ['src/**/!(*.generated).{ts,tsx}'],
  ignoreNoDocuments: true,
  generates: {
    'src/graphql/__generated__/schema-types.ts': {
      plugins: ['typescript'],
      config: {
        avoidOptionals: false,
        scalars: {
          DateTime: 'string',
          JSON: 'unknown',
        },
      },
    },
    'src/': {
      preset: 'near-operation-file',
      presetConfig: {
        baseTypesPath: 'graphql/__generated__/schema-types.ts',
        folder: '__generated__',
        extension: '.generated.ts',
      },
      plugins: ['typescript-operations', 'typescript-react-apollo'],
      config: {
        withHooks: true,
        withComponent: false,
        withHOC: false,
        scalars: {
          DateTime: 'string',
          JSON: 'unknown',
        },
      },
    },
  },
};

export default config;
