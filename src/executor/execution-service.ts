import type { ServiceConfig } from '../config.js';
import { AuditRepository } from '../audit/audit-repository.js';
import { CatalogRepository } from '../catalog/catalog-repository.js';
import { AppError, asSafeErrorCode } from '../errors/app-error.js';
import { buildBoundValues, parseExecuteRequest } from './request-validator.js';
import { QueryExecutor } from './query-executor.js';
import { assertSafeSql } from './sql-guard.js';

export class ExecutionService {
  constructor(
    private readonly config: ServiceConfig,
    private readonly catalog: CatalogRepository,
    private readonly executor: QueryExecutor,
    private readonly audit: AuditRepository
  ) {}

  async execute(body: unknown) {
    const request = parseExecuteRequest(body);
    const startedAt = performance.now();
    const definition = await this.catalog.findByUid(request.queryUid);

    if (!definition || !definition.enabled) {
      throw new AppError(404, 'QUERY_NOT_FOUND', 'Query is not available');
    }

    let rowCount: number | null = null;
    try {
      assertSafeSql(definition.sqlText, definition.operationKind, definition.parameterSchema.length);
      const values = buildBoundValues(definition.parameterSchema, request, this.config.projectCode);
      const result = await this.executor.execute(definition, values);
      rowCount = result.rowCount;
      const durationMs = Math.round(performance.now() - startedAt);
      await this.writeAudit({
        requestId: request.context.requestId,
        queryUid: definition.uid,
        actorUserId: request.context.actorUserId,
        operationKind: definition.operationKind,
        durationMs,
        rowCount,
        success: true,
        errorCode: null,
      });
      return {
        success: true,
        requestId: request.context.requestId,
        queryUid: definition.uid,
        data: result,
        meta: { durationMs, version: definition.version },
      };
    } catch (error) {
      await this.writeAudit({
        requestId: request.context.requestId,
        queryUid: definition.uid,
        actorUserId: request.context.actorUserId,
        operationKind: definition.operationKind,
        durationMs: Math.round(performance.now() - startedAt),
        rowCount,
        success: false,
        errorCode: asSafeErrorCode(error),
      });
      throw error;
    }
  }

  private async writeAudit(record: Omit<Parameters<AuditRepository['write']>[0], 'projectCode'>) {
    try {
      await this.audit.write({ ...record, projectCode: this.config.projectCode });
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'audit_write_failed',
        requestId: record.requestId,
        queryUid: record.queryUid,
        message: error instanceof Error ? error.message : 'unknown error',
      }));
    }
  }
}
