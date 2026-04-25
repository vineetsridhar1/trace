/* eslint-env node */
/* eslint-disable @typescript-eslint/no-require-imports */
/* global __dirname, process, require */
/**
 * Generates types.ts and resolvers.ts from schema.graphql.
 *
 * Shells out to graphql-codegen from within the gql package directory
 * using a dedicated config that skips the client preset (which has a
 * known duplicate-graphql module issue).
 */
const { execSync } = require("child_process");
const path = require("path");

const gqlDir = path.resolve(__dirname, "..");

try {
  execSync("npx graphql-codegen --config codegen-core.ts", {
    cwd: gqlDir,
    stdio: "inherit",
  });
} catch {
  process.exit(1);
}
