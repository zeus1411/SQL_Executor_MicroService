-- Compute checksum from the exact sql_text in your release process.
INSERT INTO public.t_sql (
  uid,
  description,
  sql_text,
  operation_kind,
  parameter_schema,
  enabled,
  statement_timeout_ms,
  max_rows,
  version,
  checksum
) VALUES (
  'example.find-by-id',
  'Example parameterized lookup',
  'SELECT id FROM public.example_table WHERE id = $1',
  'READ',
  '[{"name":"id","type":"integer","source":"client","required":true,"nullable":false}]'::jsonb,
  false,
  5000,
  100,
  1,
  '7e90c89f97521f0d014cbb777c7cb321de60628de19b54bf00a3ff77d174faf3'
)
ON CONFLICT (uid) DO UPDATE SET
  description = EXCLUDED.description,
  sql_text = EXCLUDED.sql_text,
  operation_kind = EXCLUDED.operation_kind,
  parameter_schema = EXCLUDED.parameter_schema,
  enabled = EXCLUDED.enabled,
  statement_timeout_ms = EXCLUDED.statement_timeout_ms,
  max_rows = EXCLUDED.max_rows,
  version = EXCLUDED.version,
  checksum = EXCLUDED.checksum;
