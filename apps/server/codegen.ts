import type { CodegenConfig } from '@graphql-codegen/cli';
import { defineConfig } from '@eddeee888/gcg-typescript-resolver-files';

const config: CodegenConfig = {
  overwrite: true,
  schema: 'src/schema/**/schema.graphql',
  generates: {
    'src/schema': defineConfig({
      scalarsOverrides: {
        DateTime: { type: { input: 'string', output: 'Date' } },
        ID: { type: 'string' },
      },
    }),
  },
};

export default config;
