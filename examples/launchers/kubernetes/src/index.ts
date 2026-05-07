import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

const config = loadConfig(process.env);
const app = createServer(config);

app.listen(config.port, () => {
  console.log(`Trace Kubernetes launcher listening on :${config.port}`);
});
