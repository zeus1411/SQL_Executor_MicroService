import type { OperationKind } from '../catalog/types.js';
import { AppError } from '../errors/app-error.js';

type ScanResult = { tokens: string[]; semicolonCount: number; semicolonWasLast: boolean; placeholders: number[] };

const scanSql = (sql: string): ScanResult => {
  const tokens: string[] = [];
  const placeholders: number[] = [];
  let semicolonCount = 0;
  let semicolonWasLast = false;
  let index = 0;
  let blockCommentDepth = 0;

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (blockCommentDepth > 0) {
      if (char === '/' && next === '*') { blockCommentDepth += 1; index += 2; continue; }
      if (char === '*' && next === '/') { blockCommentDepth -= 1; index += 2; continue; }
      index += 1;
      continue;
    }
    if (char === '-' && next === '-') {
      index = sql.indexOf('\n', index + 2);
      if (index === -1) break;
      continue;
    }
    if (char === '/' && next === '*') { blockCommentDepth = 1; index += 2; continue; }
    if (/\s/.test(char)) { index += 1; continue; }

    if (char === "'") {
      index += 1;
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") { index += 2; continue; }
        if (sql[index] === "'") { index += 1; break; }
        index += 1;
      }
      semicolonWasLast = false;
      continue;
    }
    if (char === '"') {
      index += 1;
      while (index < sql.length) {
        if (sql[index] === '"' && sql[index + 1] === '"') { index += 2; continue; }
        if (sql[index] === '"') { index += 1; break; }
        index += 1;
      }
      semicolonWasLast = false;
      continue;
    }
    if (char === '$') {
      const placeholder = sql.slice(index).match(/^\$(\d+)/);
      if (placeholder) {
        placeholders.push(Number(placeholder[1]));
        index += placeholder[0].length;
        semicolonWasLast = false;
        continue;
      }
      const delimiter = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (delimiter) {
        const closing = sql.indexOf(delimiter, index + delimiter.length);
        if (closing === -1) throw new AppError(500, 'INVALID_CATALOG', 'SQL contains an unterminated dollar quote');
        index = closing + delimiter.length;
        semicolonWasLast = false;
        continue;
      }
    }
    if (char === ';') {
      semicolonCount += 1;
      semicolonWasLast = true;
      index += 1;
      continue;
    }
    const word = sql.slice(index).match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0];
    if (word) {
      tokens.push(word.toUpperCase());
      semicolonWasLast = false;
      index += word.length;
      continue;
    }
    semicolonWasLast = false;
    index += 1;
  }

  if (blockCommentDepth > 0) throw new AppError(500, 'INVALID_CATALOG', 'SQL contains an unterminated comment');
  return { tokens, semicolonCount, semicolonWasLast, placeholders };
};

const blockedTokens = new Set([
  'ALTER', 'CREATE', 'DROP', 'TRUNCATE', 'GRANT', 'REVOKE', 'COPY', 'DO', 'VACUUM', 'CLUSTER',
  'REINDEX', 'COMMENT', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE', 'PREPARE',
  'DEALLOCATE', 'DISCARD', 'LISTEN', 'NOTIFY', 'UNLISTEN', 'INTO', 'PG_READ_FILE',
  'PG_WRITE_FILE', 'LO_IMPORT', 'LO_EXPORT', 'DBLINK', 'PG_TERMINATE_BACKEND',
]);

const mutationTokens = new Set(['INSERT', 'UPDATE', 'DELETE', 'MERGE']);

export const assertSafeSql = (sql: string, operationKind: OperationKind, parameterCount: number) => {
  if (!sql.trim()) throw new AppError(500, 'INVALID_CATALOG', 'SQL text is empty');
  const scan = scanSql(sql);
  if (scan.semicolonCount > 1 || (scan.semicolonCount === 1 && !scan.semicolonWasLast)) {
    throw new AppError(500, 'INVALID_CATALOG', 'Multiple SQL statements are not allowed');
  }
  const first = scan.tokens[0];
  if (!first) throw new AppError(500, 'INVALID_CATALOG', 'SQL statement is invalid');
  if (scan.tokens.some((token) => blockedTokens.has(token))) {
    throw new AppError(500, 'FORBIDDEN_SQL', 'SQL contains a forbidden operation');
  }

  const containsMutation = scan.tokens.some((token) => mutationTokens.has(token));
  if (operationKind === 'READ' && (!['SELECT', 'WITH', 'VALUES', 'EXPLAIN'].includes(first) || containsMutation)) {
    throw new AppError(500, 'OPERATION_MISMATCH', 'READ catalog entry is not read-only');
  }
  if (operationKind === 'WRITE' && !([...mutationTokens].includes(first) || (first === 'WITH' && containsMutation))) {
    throw new AppError(500, 'OPERATION_MISMATCH', 'WRITE catalog entry is not a DML statement');
  }
  if (operationKind === 'ROUTINE' && !['CALL', 'SELECT', 'WITH'].includes(first)) {
    throw new AppError(500, 'OPERATION_MISMATCH', 'ROUTINE catalog entry must call or select a routine');
  }

  const uniquePlaceholders = [...new Set(scan.placeholders)].sort((a, b) => a - b);
  if (uniquePlaceholders.some((value) => value < 1 || value > parameterCount)) {
    throw new AppError(500, 'INVALID_CATALOG', 'SQL placeholder is outside the parameter schema');
  }
  for (let expected = 1; expected <= parameterCount; expected += 1) {
    if (!uniquePlaceholders.includes(expected)) {
      throw new AppError(500, 'INVALID_CATALOG', `SQL does not reference parameter $${expected}`);
    }
  }
};

export const stripTrailingSemicolon = (sql: string) => sql.trim().replace(/;\s*$/, '');
