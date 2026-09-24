import type { PoolConfig } from 'pg';

export type ServiceConfig = {
  port: number;
  projectCode: string;
  apiKey: string;
  requestMaxBytes: number;
  defaultTimeoutMs: number;
  maxTimeoutMs: number;
  lockTimeoutMs: number;
  defaultMaxRows: number;
  maxRows: number;
  maxResponseBytes: number;
  catalogDatabase: PoolConfig;
  readDatabase: PoolConfig;
  writeDatabase: PoolConfig;
};

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value || value === 'CHANGE_ME') throw new Error(`Missing or unsafe environment variable ${name}`);
  return value;
};

const integer = (name: string, fallback: number, minimum: number, maximum: number) => {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
};

const boolean = (name: string, fallback: boolean) => {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (['true', '1', 'yes'].includes(raw)) return true;
  if (['false', '0', 'no'].includes(raw)) return false;
  throw new Error(`${name} must be true or false`);
};

const databaseConfig = (userEnv: string, passwordEnv: string): PoolConfig => ({
  host: required('DATABASE_HOST'),
  port: integer('DATABASE_PORT', 5432, 1, 65535),
  database: required('DATABASE_NAME'),
  user: required(userEnv),
  password: required(passwordEnv),
  ssl: boolean('DATABASE_SSL', false) ? { rejectUnauthorized: false } : undefined,
  max: integer('DATABASE_POOL_MAX', 10, 1, 100),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: `sql-executor:${process.env.PROJECT_CODE?.trim() || 'unknown'}`,
});

export const loadConfig = (): ServiceConfig => {
  const projectCode = required('PROJECT_CODE');
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(projectCode)) {
    throw new Error('PROJECT_CODE must contain 2-64 lowercase letters, numbers, underscores or dashes');
  }

  const apiKey = required('SQL_EXECUTOR_API_KEY');
  if (apiKey.length < 16) throw new Error('SQL_EXECUTOR_API_KEY must contain at least 16 characters');

  const maxTimeoutMs = integer('SQL_EXECUTOR_MAX_TIMEOUT_MS', 60_000, 100, 300_000);
  const defaultTimeoutMs = integer('SQL_EXECUTOR_DEFAULT_TIMEOUT_MS', 15_000, 100, maxTimeoutMs);
  const maxRows = integer('SQL_EXECUTOR_MAX_ROWS', 5_000, 1, 100_000);
  const defaultMaxRows = integer('SQL_EXECUTOR_DEFAULT_MAX_ROWS', 1_000, 1, maxRows);

  return {
    port: integer('PORT', 3200, 1, 65535),
    projectCode,
    apiKey,
    requestMaxBytes: integer('SQL_EXECUTOR_REQUEST_MAX_BYTES', 262_144, 1_024, 10_485_760),
    defaultTimeoutMs,
    maxTimeoutMs,
    lockTimeoutMs: integer('SQL_EXECUTOR_LOCK_TIMEOUT_MS', 5_000, 100, maxTimeoutMs),
    defaultMaxRows,
    maxRows,
    maxResponseBytes: integer('SQL_EXECUTOR_MAX_RESPONSE_BYTES', 5_242_880, 1_024, 52_428_800),
    catalogDatabase: databaseConfig('DATABASE_CATALOG_USER', 'DATABASE_CATALOG_PASSWORD'),
    readDatabase: databaseConfig('DATABASE_READ_USER', 'DATABASE_READ_PASSWORD'),
    writeDatabase: databaseConfig('DATABASE_WRITE_USER', 'DATABASE_WRITE_PASSWORD'),
  };
};
