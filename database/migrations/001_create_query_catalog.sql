BEGIN;

CREATE TABLE IF NOT EXISTS public.t_sql (
  uid varchar(128) PRIMARY KEY,
  description varchar(500) NOT NULL,
  sql_text text NOT NULL,
  operation_kind varchar(16) NOT NULL,
  parameter_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT false,
  statement_timeout_ms integer,
  max_rows integer,
  version integer NOT NULL DEFAULT 1,
  checksum varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT t_sql_uid_format CHECK (uid ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  CONSTRAINT t_sql_operation_kind CHECK (operation_kind IN ('READ', 'WRITE', 'ROUTINE')),
  CONSTRAINT t_sql_parameter_schema_array CHECK (jsonb_typeof(parameter_schema) = 'array'),
  CONSTRAINT t_sql_statement_timeout_positive CHECK (statement_timeout_ms IS NULL OR statement_timeout_ms > 0),
  CONSTRAINT t_sql_max_rows_positive CHECK (max_rows IS NULL OR max_rows > 0),
  CONSTRAINT t_sql_version_positive CHECK (version > 0),
  CONSTRAINT t_sql_checksum_sha256 CHECK (checksum ~ '^[0-9a-fA-F]{64}$')
);

CREATE TABLE IF NOT EXISTS public.t_sql_execution_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_code varchar(64) NOT NULL,
  request_id uuid NOT NULL,
  query_uid varchar(128) NOT NULL,
  actor_user_id varchar(255) NOT NULL,
  operation_kind varchar(16) NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer NOT NULL,
  row_count integer,
  success boolean NOT NULL,
  error_code varchar(64),
  CONSTRAINT t_sql_audit_operation_kind CHECK (operation_kind IN ('READ', 'WRITE', 'ROUTINE')),
  CONSTRAINT t_sql_audit_duration_nonnegative CHECK (duration_ms >= 0),
  CONSTRAINT t_sql_audit_row_count_nonnegative CHECK (row_count IS NULL OR row_count >= 0)
);

CREATE INDEX IF NOT EXISTS t_sql_execution_audit_uid_executed_idx
  ON public.t_sql_execution_audit (query_uid, executed_at DESC);
CREATE INDEX IF NOT EXISTS t_sql_execution_audit_actor_executed_idx
  ON public.t_sql_execution_audit (actor_user_id, executed_at DESC);

CREATE OR REPLACE FUNCTION public.t_sql_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.uid IS DISTINCT FROM OLD.uid THEN
    RAISE EXCEPTION 't_sql.uid is immutable';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_sql_set_updated_at_trigger ON public.t_sql;
CREATE TRIGGER t_sql_set_updated_at_trigger
BEFORE UPDATE ON public.t_sql
FOR EACH ROW EXECUTE FUNCTION public.t_sql_set_updated_at();

COMMIT;
