import { timingSafeEqual } from 'node:crypto';

import type { FastifyRequest } from 'fastify';

import type { ServiceConfig } from '../config.js';
import { AppError } from '../errors/app-error.js';

const safeEquals = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const header = (request: FastifyRequest, name: string) => {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

export const requireServiceAuth = (request: FastifyRequest, config: ServiceConfig) => {
  const projectCode = header(request, 'x-project-code')?.trim() || '';
  const apiKey = header(request, 'x-api-key')?.trim() || '';

  if (!apiKey || !safeEquals(apiKey, config.apiKey)) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid service credentials');
  }
  if (!safeEquals(projectCode, config.projectCode)) {
    throw new AppError(403, 'PROJECT_MISMATCH', 'Project is not allowed by this service instance');
  }
};
