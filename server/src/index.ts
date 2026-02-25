import { createApp } from './app';
import { config } from './config';
import { getDefaultChannel } from './services/channelService';
import { initStorage } from './services/storageService';

initStorage(config.storagePath);

async function main() {
  const app = await createApp();

  app.listen(config.port, async () => {
    await getDefaultChannel();
    console.log(`Trace server listening on http://localhost:${config.port}`);
  });
}

void main();
