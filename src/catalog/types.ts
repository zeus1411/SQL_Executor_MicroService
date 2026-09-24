export const OPERATION_KINDS = ['READ', 'WRITE', 'ROUTINE'] as const;
export type OperationKind = (typeof OPERATION_KINDS)[number];

export const PARAMETER_TYPES = [
  'string',
  'integer',
  'number',
  'boolean',
  'uuid',
  'date',
  'datetime',
  'json',
  'string-array',
] as const;

export type ParameterType = (typeof PARAMETER_TYPES)[number];
export type ParameterSource = 'client' | 'context';

export type ParameterDefinition = {
  name: string;
  type: ParameterType;
  source: ParameterSource;
  required: boolean;
  nullable: boolean;
  maxLength?: number;
  enum?: Array<string | number | boolean>;
};

export type QueryDefinition = {
  uid: string;
  description: string;
  sqlText: string;
  operationKind: OperationKind;
  parameterSchema: ParameterDefinition[];
  enabled: boolean;
  statementTimeoutMs: number | null;
  maxRows: number | null;
  version: number;
  checksum: string;
  updatedAt: Date;
};

export type QueryCatalogItem = Omit<QueryDefinition, 'sqlText' | 'parameterSchema'> & {
  parameters: Array<Pick<ParameterDefinition, 'name' | 'type' | 'source' | 'required' | 'nullable'>>;
};
