import path from "path";
import os from "os";
import { runDbctlDaemon } from "@trace/dbctl-core";

const runtime = process.env.TRACE_DBCTL_RUNTIME === "cloud" ? "cloud" : "local";
const rootDir =
  process.env.TRACE_DBCTL_ROOT ??
  (runtime === "cloud"
    ? "/var/lib/trace-db"
    : path.join(os.homedir(), ".trace", "dbctl"));
const socketPath =
  process.env.TRACE_DBCTL_SOCKET_PATH ?? path.join(rootDir, "run", "dbctl.sock");

runDbctlDaemon({ rootDir, socketPath }).catch((error) => {
  console.error("[dbctl-daemon] fatal error:", error);
  process.exit(1);
});
