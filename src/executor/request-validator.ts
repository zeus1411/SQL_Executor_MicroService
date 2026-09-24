import { z } from 'zod';

import type { ParameterDefinition } from '../catalog/types.js';
import { AppError } from '../errors/app-error.js';

const requestSchema = z.object({
  queryUid: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  params: z.array(z.object({ name: z.string(), value: z.unknown() })).max(100).default([]),
  context: z.object({
    requestId: z.string().uuid(),
    actorUserId: z.string().min(1).max(255),
  }),
}).strict();

export type ExecuteRequest = z.infer<typeof requestSchema>;

export const parseExecuteRequest = (body: unknown): ExecuteRequest => {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'INVALID_REQUEST', 'Request body is invalid', parsed.error.flatten());
  }
  return parsed.data;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const validateValue = (definition: ParameterDefinition, value: unknown) => {
  if (value === null) {
    if (!definition.nullable) throw new AppError(400, 'INVALID_PARAMETER', `${definition.name} cannot be null`);
    return null;
  }

  let valid = false;
  switch (definition.type) {
    case 'string':
      valid = typeof value === 'string';
      break;
    case 'integer':
      valid = typeof value === 'number' && Number.isSafeInteger(value);
      break;
    case 'number':
      valid = typeof value === 'number' && Number.isFinite(value);
      break;
    case 'boolean':
      valid = typeof value === 'boolean';
      break;
    case 'uuid':
      valid = typeof value === 'string' && UUID_PATTERN.test(value);
      break;
    case 'date':
      valid = typeof value === 'string' && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
      break;
    case 'datetime':
      valid = typeof value === 'string' && !Number.isNaN(Date.parse(value));
      break;
    case 'json':
      valid = typeof value === 'object';
      break;
    case 'string-array':
      valid = Array.isArray(value) && value.every((entry) => typeof entry === 'string');
      break;
  }

  if (!valid) throw new AppError(400, 'INVALID_PARAMETER', `${definition.name} has an invalid type`);
  if (definition.maxLength !== undefined) {
    const length = typeof value === 'string' || Array.isArray(value) ? value.length : 0;
    if (length > definition.maxLength) {
      throw new AppError(400, 'INVALID_PARAMETER', `${definition.name} exceeds its maximum length`);
    }
  }
  if (definition.enum && !definition.enum.some((entry) => Object.is(entry, value))) {
    throw new AppError(400, 'INVALID_PARAMETER', `${definition.name} is not an allowed value`);
  }
  return value;
};

export const buildBoundValues = (
  definitions: ParameterDefinition[],
  request: ExecuteRequest,
  projectCode: string
) => {
  const clientValues = new Map<string, unknown>();
  for (const parameter of request.params) {
    if (clientValues.has(parameter.name)) {
      throw new AppError(400, 'DUPLICATE_PARAMETER', `Duplicate parameter ${parameter.name}`);
    }
    clientValues.set(parameter.name, parameter.value);
  }

  const allowedClientNames = new Set(
    definitions.filter((definition) => definition.source === 'client').map((definition) => definition.name)
  );
  for (const name of clientValues.keys()) {
    if (!allowedClientNames.has(name)) {
      throw new AppError(400, 'UNKNOWN_PARAMETER', `Unknown parameter ${name}`);
    }
  }

  const trustedContext: Record<string, unknown> = {
    requestId: request.context.requestId,
    actorUserId: request.context.actorUserId,
    projectCode,
  };

  return definitions.map((definition) => {
    const source = definition.source === 'client' ? clientValues : new Map(Object.entries(trustedContext));
    if (!source.has(definition.name)) {
      if (definition.required) {
        throw new AppError(400, 'MISSING_PARAMETER', `Missing parameter ${definition.name}`);
      }
      return null;
    }
    return validateValue(definition, source.get(definition.name));
  });
};
