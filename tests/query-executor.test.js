import assert from 'node:assert/strict';
import test from 'node:test';

import { AppError } from '../dist/errors/app-error.js';
import { QueryExecutor } from '../dist/executor/query-executor.js';

test('rolls back a write when the response byte limit is exceeded', async () => {
  const commands = [];
  const client = {
    query: async (sql) => {
      commands.push(sql);
      if (sql === 'UPDATE example SET value = $1 RETURNING value') {
        return { rows: [{ value: 'x'.repeat(100) }], rowCount: 1, command: 'UPDATE' };
      }
      return { rows: [], rowCount: 0, command: '' };
    },
    release: () => commands.push('RELEASE_CLIENT'),
  };
  const pool = { connect: async () => client };
  const config = {
    defaultTimeoutMs: 1000,
    maxTimeoutMs: 1000,
    lockTimeoutMs: 500,
    defaultMaxRows: 10,
    maxRows: 10,
    maxResponseBytes: 10,
  };
  const query = {
    uid: 'test.write',
    description: 'test',
    sqlText: 'UPDATE example SET value = $1 RETURNING value',
    operationKind: 'WRITE',
    parameterSchema: [],
    enabled: true,
    statementTimeoutMs: null,
    maxRows: null,
    version: 1,
    checksum: '0'.repeat(64),
    updatedAt: new Date(),
  };

  const executor = new QueryExecutor(config, pool, pool);
  await assert.rejects(
    executor.execute(query, ['value']),
    (error) => error instanceof AppError && error.code === 'RESULT_TOO_LARGE'
  );
  assert.equal(commands.includes('COMMIT'), false);
  assert.equal(commands.includes('ROLLBACK'), true);
  assert.equal(commands.at(-1), 'RELEASE_CLIENT');
});
