-- Run this after a DBA creates the three LOGIN roles shown in roles.example.sql.
BEGIN;

REVOKE ALL ON public.t_sql FROM PUBLIC;
REVOKE ALL ON public.t_sql_execution_audit FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO sql_executor_catalog, sql_executor_read, sql_executor_write;
GRANT SELECT ON public.t_sql TO sql_executor_catalog;
GRANT INSERT ON public.t_sql_execution_audit TO sql_executor_write;
GRANT USAGE, SELECT ON SEQUENCE public.t_sql_execution_audit_id_seq TO sql_executor_write;

-- Project DBAs must explicitly add read grants to sql_executor_read and narrowly
-- scoped DML/EXECUTE grants to sql_executor_write for approved tables/routines.

COMMIT;
