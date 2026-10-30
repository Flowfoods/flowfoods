-- Exclusivo do Postgres 16 efêmero do job portao, ANTES das migrations.
-- As senhas abaixo são fixtures públicas dos testes *migracao.db.test.ts,
-- nunca credenciais de aplicação ou produção. Não usar em banco persistente.
-- Invocação: psql -X -v ON_ERROR_STOP=1
--   -v ci_postgres_efemero=github-actions-service-postgres16 -f este-arquivo

BEGIN;
SELECT set_config('flowfoods.ci_postgres_efemero', :'ci_postgres_efemero', true);

DO $$
BEGIN
  IF current_setting('flowfoods.ci_postgres_efemero', true) IS DISTINCT FROM 'github-actions-service-postgres16'
     OR current_database() <> 'ff' OR current_user <> 'ff'
     OR current_setting('server_version_num')::int NOT BETWEEN 160000 AND 169999 THEN
    RAISE EXCEPTION 'Preparação restrita ao serviço efêmero Postgres 16 do portão (usuário ff, banco ff).';
  END IF;
  -- O job cria um serviço novo. Recusar qualquer banco já populado/migrado:
  -- este script não é migração nem administração do banco de produção.
  IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p')) THEN
    RAISE EXCEPTION 'Preparação exige schema public vazio, antes das migrations do banco descartável.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper) THEN
    RAISE EXCEPTION 'O administrador do serviço efêmero precisa preparar os papéis antes dos testes.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    CREATE ROLE erp_tenant;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ff_dono') THEN
    CREATE ROLE ff_dono;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ff_semrls') THEN
    CREATE ROLE ff_semrls;
  END IF;
END $$;

ALTER ROLE erp_tenant NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
ALTER ROLE ff_dono LOGIN PASSWORD 'ff_dono' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT;
ALTER ROLE ff_semrls LOGIN PASSWORD 'ff_semrls' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;

-- ff_dono instala FORCE RLS nas tabelas que ele próprio cria nos bancos dos
-- cenários. O contexto app.parceiro_id continua obrigatório. A herança permite
-- que os gatilhos SECURITY DEFINER do dono também usem a política do tenant;
-- não contorna FORCE RLS. Sem ADMIN, não pode conceder o papel a ff_semrls.
GRANT erp_tenant TO ff_dono WITH ADMIN FALSE;
GRANT erp_tenant TO ff_dono WITH INHERIT TRUE;
GRANT erp_tenant TO ff_dono WITH SET TRUE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_auth_members
    WHERE roleid = 'erp_tenant'::regrole AND member = 'ff_semrls'::regrole
  ) THEN
    REVOKE erp_tenant FROM ff_semrls;
  END IF;

  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('ff_dono', 'ff_semrls')
      AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole
      AND NOT rolcreatedb AND NOT rolreplication AND rolinherit = (rolname = 'ff_dono')) <> 2 THEN
    RAISE EXCEPTION 'Os dois donos de teste devem existir com LOGIN, sem privilégios administrativos ou BYPASSRLS.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant'
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole
      AND NOT rolcreatedb AND NOT rolreplication AND NOT rolinherit) THEN
    RAISE EXCEPTION 'O papel erp_tenant do teste deve ser NOLOGIN e sem privilégios administrativos.';
  END IF;
  IF NOT pg_has_role('ff_dono', 'erp_tenant', 'SET') OR NOT pg_has_role('ff_dono', 'erp_tenant', 'USAGE') OR NOT EXISTS (
    SELECT 1 FROM pg_auth_members WHERE roleid = 'erp_tenant'::regrole AND member = 'ff_dono'::regrole
      AND set_option AND inherit_option AND NOT admin_option
  ) THEN
    RAISE EXCEPTION 'ff_dono precisa de SET e INHERIT erp_tenant, sem ADMIN.';
  END IF;
  IF pg_has_role('ff_semrls', 'erp_tenant', 'MEMBER') THEN
    RAISE EXCEPTION 'ff_semrls não pode ser membro direto ou indireto de erp_tenant.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members
    WHERE member IN ('ff_dono'::regrole, 'ff_semrls'::regrole, 'erp_tenant'::regrole)
      AND NOT (member = 'ff_dono'::regrole AND roleid = 'erp_tenant'::regrole)
  ) THEN
    RAISE EXCEPTION 'Os papéis de teste não podem herdar outros papéis do cluster.';
  END IF;
END $$;
COMMIT;
