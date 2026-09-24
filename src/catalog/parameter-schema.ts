import { z } from 'zod';

import { PARAMETER_TYPES, type ParameterDefinition } from './types.js';
import { AppError } from '../errors/app-error.js';

const definitionSchema = z.object({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  type: z.enum(PARAMETER_TYPES),
  source: z.enum(['client', 'context']).default('client'),
  required: z.boolean().default(true),
  nullable: z.boolean().default(false),
  maxLength: z.number().int().positive().max(1_000_000).optional(),
  enum: z.array(z.union([z.string(), z.number(), z.boolean()])).max(1_000).optional(),
});

const schema = z.array(definitionSchema).max(100);

export const parseParameterSchema = (value: unknown): ParameterDefinition[] => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(500, 'INVALID_CATALOG', 'Query parameter schema is invalid');
  }

  const names = new Set<string>();
  for (const definition of parsed.data) {
    if (names.has(definition.name)) {
      throw new AppError(500, 'INVALID_CATALOG', 'Query parameter schema contains duplicate names');
    }
    names.add(definition.name);
  }

  return parsed.data;
};
