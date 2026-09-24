import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabasePools } from './db/pools.js';

const config = loadConfig();
const pools = createDatabasePools(config);
const app = buildApp(config, pools);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: '0.0.0.0', port: config.port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exit(1);
}
