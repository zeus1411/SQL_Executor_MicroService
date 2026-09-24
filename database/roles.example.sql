-- Replace all passwords before running. Do not commit real secrets.
CREATE ROLE sql_executor_catalog LOGIN PASSWORD 'REPLACE_CATALOG_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE sql_executor_read LOGIN PASSWORD 'REPLACE_READ_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE sql_executor_write LOGIN PASSWORD 'REPLACE_WRITE_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

-- Examples only; adjust to the project's approved objects.
-- GRANT SELECT ON public.some_view TO sql_executor_read;
-- GRANT EXECUTE ON FUNCTION public.import_health_facility(uuid, varchar) TO sql_executor_write;
