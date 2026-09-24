import type { Pool, PoolClient, QueryResult } from 'pg';
import Cursor from 'pg-cursor';

import type { ServiceConfig } from '../config.js';
import type { QueryDefinition } from '../catalog/types.js';
import { AppError } from '../errors/app-error.js';
import { stripTrailingSemicolon } from './sql-guard.js';

export type ExecutionResult = {
  rows: unknown[];
  rowCount: number;
  command: string;
  truncated: boolean;
};

const configureTransaction = async (
  client: PoolClient,
  timeoutMs: number,
  lockTimeoutMs: number
) => {
  await client.query(`SELECT set_config('statement_timeout', $1, true)`, [`${timeoutMs}ms`]);
  await client.query(`SELECT set_config('lock_timeout', $1, true)`, [`${lockTimeoutMs}ms`]);
};

const readCursor = <T extends Record<string, unknown>>(cursor: Cursor<T>, count: number) =>
  new Promise<T[]>((resolve, reject) => {
    cursor.read(count, (error, rows) => (error ? reject(error) : resolve(rows)));
  });

const closeCursor = (cursor: Cursor) =>
  new Promise<void>((resolve, reject) => {
    cursor.close((error) => (error ? reject(error) : resolve()));
  });

const executeRead = async (
  client: PoolClient,
  query: QueryDefinition,
  values: unknown[],
  maxRows: number
): Promise<ExecutionResult> => {
  const cursor = client.query(new Cursor(stripTrailingSemicolon(query.sqlText), values));
  try {
    const rows = await readCursor(cursor, maxRows + 1);
    const truncated = rows.length > maxRows;
    if (truncated) rows.length = maxRows;
    return { rows, rowCount: rows.length, command: 'SELECT', truncated };
  } finally {
    await closeCursor(cursor).catch(() => undefined);
  }
};

const executeMutation = async (
  client: PoolClient,
  query: QueryDefinition,
  values: unknown[],
  maxRows: number
): Promise<ExecutionResult> => {
  const result: QueryResult = await client.query(stripTrailingSemicolon(query.sqlText), values);
  const rows = result.rows.slice(0, maxRows);
  return {
    rows,
    rowCount: result.rowCount ?? rows.length,
    command: result.command || query.operationKind,
    truncated: result.rows.length > maxRows,
  };
};

export class QueryExecutor {
  constructor(
    private readonly config: ServiceConfig,
    private readonly readPool: Pool,
    private readonly writePool: Pool
  ) {}

  async execute(query: QueryDefinition, values: unknown[]): Promise<ExecutionResult> {
    const pool = query.operationKind === 'READ' ? this.readPool : this.writePool;
    const client = await pool.connect();
    const timeoutMs = Math.min(
      query.statementTimeoutMs ?? this.config.defaultTimeoutMs,
      this.config.maxTimeoutMs
    );
    const maxRows = Math.min(query.maxRows ?? this.config.defaultMaxRows, this.config.maxRows);
    let transactionStarted = false;

    try {
      await client.query(query.operationKind === 'READ' ? 'BEGIN READ ONLY' : 'BEGIN');
      transactionStarted = true;
      await configureTransaction(client, timeoutMs, this.config.lockTimeoutMs);
      const result = query.operationKind === 'READ'
        ? await executeRead(client, query, values, maxRows)
        : await executeMutation(client, query, values, maxRows);
      const responseBytes = Buffer.byteLength(JSON.stringify(result.rows), 'utf8');
      if (responseBytes > this.config.maxResponseBytes) {
        throw new AppError(422, 'RESULT_TOO_LARGE', 'Query result exceeds the response size limit');
      }
      await client.query('COMMIT');
      transactionStarted = false;
      return result;
    } catch (error) {
      if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
