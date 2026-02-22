import { createApp } from './app';
import { config } from './config';
import { getDefaultChannel } from './services/channelService';

const app = createApp();

app.listen(config.port, async () => {
  await getDefaultChannel();
  console.log(`Trace server listening on http://localhost:${config.port}`);
});
