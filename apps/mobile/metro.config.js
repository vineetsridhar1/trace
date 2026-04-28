// Monorepo-aware Metro config.
// See https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders.push(workspaceRoot);
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

const workspaceAliases = new Map([
  ["@trace/client-core", path.resolve(workspaceRoot, "packages/client-core/src/index.ts")],
  ["@trace/gql", path.resolve(workspaceRoot, "packages/gql/src/index.ts")],
  ["@trace/shared", path.resolve(workspaceRoot, "packages/shared/src/index.ts")],
]);

// Workspace packages (@trace/*) ship TypeScript source and use the ESM
// convention of explicit `.js` import specifiers that TypeScript rewrites at
// compile time. Metro doesn't perform that rewrite, so strip the suffix on
// relative imports and let Metro resolve against `.ts`/`.tsx` via sourceExts.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const alias = workspaceAliases.get(moduleName);
  if (alias) {
    return context.resolveRequest(context, alias, platform);
  }

  if (moduleName.endsWith(".js") && (moduleName.startsWith("./") || moduleName.startsWith("../"))) {
    try {
      return context.resolveRequest(context, moduleName.replace(/\.js$/, ""), platform);
    } catch {
      // fall through to default resolution to surface the real error
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
