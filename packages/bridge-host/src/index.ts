// The local runtime host, extracted from apps/desktop/src/bridge.ts. Hosts
// (desktop, CLI) call setBridgeHostPaths() during bootstrap, then construct
// BridgeClient with their auth-header provider. The wire protocol lives in
// @trace/shared/src/bridge.ts and is unchanged by this package.
export { setBridgeHostPaths, getBridgeHostPaths, type BridgeHostPaths } from "./host-paths.js";

export {
  BridgeClient,
  getGithubCliStatus,
  type BridgeConnectionStatus,
  type GithubCliStatus,
} from "./bridge.js";

export {
  getConfigPath,
  getBridgeLabel,
  getOrCreateInstanceId,
  getRepoConfig,
  getRepoPath,
  readConfig,
  removeRepoPath,
  saveRepoPath,
  setBridgeLabel,
  setRepoGitHooksEnabled,
  setRepoLinkedCheckout,
  type LinkedCheckoutConfig,
  type LocalRepoConfig,
  type RepoPathConfig,
} from "./config.js";

export {
  disableRepoHooks,
  getRepoHookStatus,
  installOrRepairRepoHooks,
  installOrRepairRepoHooksBestEffort,
} from "./repo-hooks.js";

export { ensureHookRunnerEntrypoint } from "./hook-runtime.js";
