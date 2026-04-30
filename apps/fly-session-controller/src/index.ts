import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

const config = loadConfig(process.env);
const app = createServer(config);

app.listen(config.port, () => {
  console.log(
    JSON.stringify({
      level: "info",
      event: "controller_listening",
      port: config.port,
      flyAppName: config.flyAppName,
      flyRegion: config.flyRegion,
    }),
  );
});
