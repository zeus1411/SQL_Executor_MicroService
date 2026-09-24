import assert from 'node:assert/strict';
import test from 'node:test';

import { AppError } from '../dist/errors/app-error.js';
import { buildBoundValues, parseExecuteRequest } from '../dist/executor/request-validator.js';
import { assertSafeSql } from '../dist/executor/sql-guard.js';

const context = {
  requestId: 'd3ca4351-b991-49c7-9ad9-f6a72e279c53',
  actorUserId: 'user-1',
};

test('allows parameterized read query and treats injection text as a value', () => {
  assert.doesNotThrow(() => assertSafeSql('SELECT id FROM users WHERE name = $1', 'READ', 1));
  const request = parseExecuteRequest({
    queryUid: 'users.find',
    params: [{ name: 'name', value: "x' OR 1=1 --" }],
    context,
  });
  assert.deepEqual(
    buildBoundValues([
      { name: 'name', type: 'string', source: 'client', required: true, nullable: false },
    ], request, 'swm'),
    ["x' OR 1=1 --"]
  );
});

test('rejects multiple statements and forbidden DDL', () => {
  assert.throws(
    () => assertSafeSql('SELECT 1; DROP TABLE users', 'READ', 0),
    (error) => error instanceof AppError && error.code === 'INVALID_CATALOG'
  );
  assert.throws(
    () => assertSafeSql('CREATE TABLE x(id int)', 'WRITE', 0),
    (error) => error instanceof AppError && error.code === 'FORBIDDEN_SQL'
  );
});

test('ignores semicolons and dangerous words inside literals', () => {
  assert.doesNotThrow(() => assertSafeSql("SELECT 'DROP; TABLE' AS value", 'READ', 0));
});

test('rejects missing, unknown and duplicate parameters', () => {
  const definitions = [
    { name: 'id', type: 'integer', source: 'client', required: true, nullable: false },
  ];
  const base = { queryUid: 'test.query', context };
  assert.throws(() => buildBoundValues(definitions, parseExecuteRequest({ ...base, params: [] }), 'swm'));
  assert.throws(() => buildBoundValues(definitions, parseExecuteRequest({
    ...base,
    params: [{ name: 'other', value: 1 }],
  }), 'swm'));
  assert.throws(() => buildBoundValues(definitions, parseExecuteRequest({
    ...base,
    params: [{ name: 'id', value: 1 }, { name: 'id', value: 2 }],
  }), 'swm'));
});

test('trusted context cannot be supplied through client params', () => {
  const definitions = [
    { name: 'actorUserId', type: 'string', source: 'context', required: true, nullable: false },
  ];
  const request = parseExecuteRequest({
    queryUid: 'test.context',
    params: [{ name: 'actorUserId', value: 'attacker' }],
    context,
  });
  assert.throws(
    () => buildBoundValues(definitions, request, 'swm'),
    (error) => error instanceof AppError && error.code === 'UNKNOWN_PARAMETER'
  );
});

test('placeholder set must exactly match the schema', () => {
  assert.throws(
    () => assertSafeSql('SELECT $2', 'READ', 1),
    (error) => error instanceof AppError && error.code === 'INVALID_CATALOG'
  );
  assert.throws(
    () => assertSafeSql('SELECT 1', 'READ', 1),
    (error) => error instanceof AppError && error.code === 'INVALID_CATALOG'
  );
});
