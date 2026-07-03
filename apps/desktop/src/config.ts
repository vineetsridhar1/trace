// Repo-registry/config storage moved to @trace/bridge-host (ticket 13); the
// desktop injects its Electron-derived locations here. The config file stays
// at ~/.trace/config.json and the instance ID under userData — byte-identical
// behavior to the pre-extraction code.
import path from "path";
import { app } from "electron";
import { setBridgeHostPaths } from "@trace/bridge-host";

setBridgeHostPaths({
  configPath: path.join(app.getPath("home"), ".trace", "config.json"),
  stateDir: path.join(app.getPath("userData"), "bridge"),
});

export {
  getConfigPath,
  getBridgeLabel,
  getOrCreateInstanceId,
  getRepoConfig,
  getRepoPath,
  readConfig,
  saveRepoPath,
  setBridgeLabel,
  setRepoGitHooksEnabled,
  setRepoLinkedCheckout,
  type LinkedCheckoutConfig,
  type LocalRepoConfig,
  type RepoPathConfig,
} from "@trace/bridge-host";
