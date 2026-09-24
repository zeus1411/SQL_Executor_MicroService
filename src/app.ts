import Fastify, { type FastifyInstance } from 'fastify';

import type { ServiceConfig } from './config.js';
import type { DatabasePools } from './db/pools.js';
import { requireServiceAuth } from './auth/service-auth.js';
import { AuditRepository } from './audit/audit-repository.js';
import { CatalogRepository } from './catalog/catalog-repository.js';
import { AppError } from './errors/app-error.js';
import { ExecutionService } from './executor/execution-service.js';
import { QueryExecutor } from './executor/query-executor.js';

const databaseError = (error: unknown) => {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 0;
  if (code === 'FST_ERR_CTP_BODY_TOO_LARGE' || statusCode === 413) {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  if (statusCode === 400) return new AppError(400, 'INVALID_REQUEST', 'Request body is invalid');
  if (code === '57014') return new AppError(504, 'QUERY_TIMEOUT', 'Query execution timed out');
  if (code === '55P03') return new AppError(409, 'LOCK_TIMEOUT', 'Database lock timeout');
  if (code.startsWith('23')) return new AppError(409, 'CONSTRAINT_VIOLATION', 'Database constraint violation');
  return new AppError(500, 'DATABASE_ERROR', 'Database operation failed');
};

export const buildApp = (config: ServiceConfig, pools: DatabasePools): FastifyInstance => {
  const app = Fastify({
    logger: true,
    bodyLimit: config.requestMaxBytes,
    requestIdHeader: 'x-request-id',
  });
  const catalog = new CatalogRepository(pools.catalog);
  const execution = new ExecutionService(
    config,
    catalog,
    new QueryExecutor(config, pools.read, pools.write),
    new AuditRepository(pools.write)
  );

  app.get('/health', async (_request, reply) => {
    try {
      await pools.catalog.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  app.register(async (protectedRoutes) => {
    protectedRoutes.addHook('onRequest', async (request) => requireServiceAuth(request, config));

    protectedRoutes.get('/v1/queries/catalog', async () => ({
      success: true,
      data: await catalog.list(),
    }));

    protectedRoutes.post('/v1/queries/execute', async (request, reply) => {
      const result = await execution.execute(request.body);
      return reply.code(200).send(result);
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.setErrorHandler((error, request, reply) => {
    const safeError = error instanceof AppError ? error : databaseError(error);
    const internalMessage = error instanceof Error ? error.message : 'unknown error';
    request.log.error({
      code: safeError.code,
      statusCode: safeError.statusCode,
      message: internalMessage,
    }, 'request failed');
    reply.code(safeError.statusCode).send({
      success: false,
      requestId: request.id,
      error: {
        code: safeError.code,
        message: safeError.message,
        ...(safeError.statusCode === 400 && safeError.details ? { details: safeError.details } : {}),
      },
    });
  });

  app.addHook('onClose', async () => pools.close());
  return app;
};
