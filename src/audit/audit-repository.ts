import type { Pool } from 'pg';

import type { OperationKind } from '../catalog/types.js';

export type AuditRecord = {
  projectCode: string;
  requestId: string;
  queryUid: string;
  actorUserId: string;
  operationKind: OperationKind;
  durationMs: number;
  rowCount: number | null;
  success: boolean;
  errorCode: string | null;
};

export class AuditRepository {
  constructor(private readonly pool: Pool) {}

  async write(record: AuditRecord) {
    await this.pool.query(
      `INSERT INTO public.t_sql_execution_audit (
        project_code, request_id, query_uid, actor_user_id, operation_kind,
        duration_ms, row_count, success, error_code
      ) VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9)`,
      [
        record.projectCode,
        record.requestId,
        record.queryUid,
        record.actorUserId,
        record.operationKind,
        record.durationMs,
        record.rowCount,
        record.success,
        record.errorCode,
      ]
    );
  }
}
