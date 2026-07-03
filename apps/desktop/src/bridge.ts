// The runtime-host implementation moved to @trace/bridge-host (ticket 13).
// This shim keeps desktop-internal import paths stable; host paths are
// configured in ./config.js, which every consumer of this module also loads
// via main.ts before constructing the client.
export {
  BridgeClient,
  getGithubCliStatus,
  type BridgeConnectionStatus,
  type GithubCliStatus,
} from "@trace/bridge-host";
