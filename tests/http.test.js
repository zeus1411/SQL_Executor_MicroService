import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../dist/app.js';

const config = {
  port: 3200,
  projectCode: 'swm',
  apiKey: 'test-api-key-123456789',
  requestMaxBytes: 262144,
  defaultTimeoutMs: 15000,
  maxTimeoutMs: 60000,
  lockTimeoutMs: 5000,
  defaultMaxRows: 1000,
  maxRows: 5000,
  maxResponseBytes: 5242880,
  catalogDatabase: {},
  readDatabase: {},
  writeDatabase: {},
};

const catalogRow = {
  uid: 'test.read',
  description: 'Safe catalog item',
  sql_text: 'SELECT $1::integer AS value',
  operation_kind: 'READ',
  parameter_schema: [{ name: 'value', type: 'integer', source: 'client', required: true, nullable: false }],
  enabled: true,
  statement_timeout_ms: 1000,
  max_rows: 10,
  version: 1,
  checksum: '99b9479ec8a4d847879806bb53aba6275e9d75fedf2771814807a7d4336622ca',
  updated_at: new Date(),
};

const createApp = () => {
  const catalog = { query: async (sql) => ({ rows: sql === 'SELECT 1' ? [{ '?column?': 1 }] : [catalogRow] }) };
  const unused = { query: async () => ({ rows: [] }), connect: async () => { throw new Error('not used'); } };
  return buildApp(config, { catalog, read: unused, write: unused, close: async () => undefined });
};

test('health is public while catalog requires service credentials', async () => {
  const app = createApp();
  const health = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(health.statusCode, 200);

  const unauthenticated = await app.inject({ method: 'GET', url: '/v1/queries/catalog' });
  assert.equal(unauthenticated.statusCode, 401);

  const wrongProject = await app.inject({
    method: 'GET',
    url: '/v1/queries/catalog',
    headers: { 'x-api-key': config.apiKey, 'x-project-code': 'oms' },
  });
  assert.equal(wrongProject.statusCode, 403);
  await app.close();
});

test('catalog omits SQL text', async () => {
  const app = createApp();
  const response = await app.inject({
    method: 'GET',
    url: '/v1/queries/catalog',
    headers: { 'x-api-key': config.apiKey, 'x-project-code': config.projectCode },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.data[0].uid, catalogRow.uid);
  assert.equal('sqlText' in body.data[0], false);
  assert.equal('parameterSchema' in body.data[0], false);
  await app.close();
});
