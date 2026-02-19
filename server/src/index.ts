import { createApp } from './app';
import { config } from './config';

const app = createApp();

app.listen(config.port, () => {
  console.log(`Trace server listening on http://localhost:${config.port}`);
});
