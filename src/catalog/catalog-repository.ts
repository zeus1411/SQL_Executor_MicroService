import { createHash } from 'node:crypto';

import type { Pool } from 'pg';

import { AppError } from '../errors/app-error.js';
import { parseParameterSchema } from './parameter-schema.js';
import { OPERATION_KINDS, type OperationKind, type QueryCatalogItem, type QueryDefinition } from './types.js';

type QueryRow = {
  uid: string;
  description: string;
  sql_text: string;
  operation_kind: string;
  parameter_schema: unknown;
  enabled: boolean;
  statement_timeout_ms: number | null;
  max_rows: number | null;
  version: number;
  checksum: string;
  updated_at: Date;
};

const isOperationKind = (value: string): value is OperationKind =>
  (OPERATION_KINDS as readonly string[]).includes(value);

const mapDefinition = (row: QueryRow): QueryDefinition => {
  if (!isOperationKind(row.operation_kind)) {
    throw new AppError(500, 'INVALID_CATALOG', 'Query operation kind is invalid');
  }
  const actualChecksum = createHash('sha256').update(row.sql_text, 'utf8').digest('hex');
  if (actualChecksum !== row.checksum.toLowerCase()) {
    throw new AppError(500, 'CATALOG_CHECKSUM_MISMATCH', 'Query SQL checksum does not match its catalog metadata');
  }
  return {
    uid: row.uid,
    description: row.description,
    sqlText: row.sql_text,
    operationKind: row.operation_kind,
    parameterSchema: parseParameterSchema(row.parameter_schema),
    enabled: row.enabled,
    statementTimeoutMs: row.statement_timeout_ms,
    maxRows: row.max_rows,
    version: row.version,
    checksum: row.checksum,
    updatedAt: row.updated_at,
  };
};

const columns = `
  uid, description, sql_text, operation_kind, parameter_schema, enabled,
  statement_timeout_ms, max_rows, version, checksum, updated_at
`;

export class CatalogRepository {
  constructor(private readonly pool: Pool) {}

  async findByUid(uid: string) {
    const result = await this.pool.query<QueryRow>(
      `SELECT ${columns} FROM public.t_sql WHERE uid = $1`,
      [uid]
    );
    return result.rows[0] ? mapDefinition(result.rows[0]) : null;
  }

  async list(): Promise<QueryCatalogItem[]> {
    const result = await this.pool.query<QueryRow>(`SELECT ${columns} FROM public.t_sql ORDER BY uid`);
    return result.rows.map((row) => {
      const definition = mapDefinition(row);
      const { sqlText: _sqlText, parameterSchema, ...metadata } = definition;
      return {
        ...metadata,
        parameters: parameterSchema.map(({ name, type, source, required, nullable }) => ({
          name,
          type,
          source,
          required,
          nullable,
        })),
      };
    });
  }
}
