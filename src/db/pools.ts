import { Pool } from 'pg';

import type { ServiceConfig } from '../config.js';

export type DatabasePools = {
  catalog: Pool;
  read: Pool;
  write: Pool;
  close: () => Promise<void>;
};

export const createDatabasePools = (config: ServiceConfig): DatabasePools => {
  const catalog = new Pool(config.catalogDatabase);
  const read = new Pool(config.readDatabase);
  const write = new Pool(config.writeDatabase);

  for (const [name, pool] of Object.entries({ catalog, read, write })) {
    pool.on('error', (error) => {
      console.error(JSON.stringify({ level: 'error', event: 'idle_pool_error', pool: name, message: error.message }));
    });
  }

  return {
    catalog,
    read,
    write,
    close: async () => {
      await Promise.allSettled([catalog.end(), read.end(), write.end()]);
    },
  };
};
