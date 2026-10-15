-- ERP 0.2 — Multi-tenant: defesa em profundidade no BANCO.
--
-- Só ADITIVA: nenhuma coluna, tabela ou índice muda. Duas peças:
--
-- A. `erp_exigir_parceiro_ativo(id)`: confere, DENTRO da transação de escrita,
--    que o parceiro está ATIVO (com FOR SHARE: uma suspensão concorrente espera
--    a escrita terminar, ou a escrita vê a suspensão). Sempre criada.
--
-- B. Row-Level Security nas 29 tabelas de tenant, com o papel `erp_tenant`
--    (padrão prisma-client-extensions/row-level-security). O portão
--    (`src/lib/erp/tenant.ts`) abre toda transação com
--      set_config('app.parceiro_id', <id>, true), set_config('role', 'erp_tenant', true)
--    e, debaixo do papel, até SQL cru só vê e só grava linhas daquele parceiro.
--    Sem `app.parceiro_id`, a política compara com NULL: nada aparece.
--
--    SÓ é instalada quando quem roda a migration pode fazê-la por inteiro:
--      - é dono (ou superusuário) das 29 tabelas — ALTER TABLE/POLICY/GRANT exigem;
--      - o papel existe ou dá para criá-lo (superusuário ou CREATEROLE);
--      - consegue assumir o papel (SET), ou concede a si mesmo.
--    Senão: RAISE NOTICE e segue SEM RLS — o deploy não quebra, e o portão
--    detecta em runtime que o papel não está disponível (avisa uma vez no log)
--    e continua isolando pelo filtro de `parceiroId` + FK composta + triggers.
--
-- Por que o papel: o usuário do app em produção é SUPERUSER (docker-compose) e
-- superusuário IGNORA RLS. Debaixo de `erp_tenant` (sem BYPASSRLS) a política
-- vale. FORCE faz valer também para um dono não-superusuário (o `$queryRaw` do
-- portal, nesse cenário, deixa de ver dado de tenant fora do papel).
--
-- Limite honesto: protege contra consulta que ESQUECE o filtro, não contra SQL
-- escrito para fugir (por isso `cliente.sql` recusa set_config/role/reset etc.).

-- A. Conferência de status (SECURITY DEFINER: o papel `erp_tenant` não lê
--    ParceiroFlow; a função lê só o status do id pedido).
CREATE OR REPLACE FUNCTION "erp_exigir_parceiro_ativo"(p_parceiro text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE
  s text;
BEGIN
  SELECT "status"::text INTO s FROM "ParceiroFlow" WHERE "id" = p_parceiro FOR SHARE;
  IF s IS DISTINCT FROM 'ATIVO' THEN
    RAISE EXCEPTION 'erp_parceiro_inativo: parceiro % está %, escrita recusada', p_parceiro, coalesce(s, 'INEXISTENTE')
      USING ERRCODE = 'P0001';
  END IF;
  RETURN s;
END $$;
REVOKE ALL ON FUNCTION "erp_exigir_parceiro_ativo"(text) FROM PUBLIC;

-- B. RLS, só se der para instalar por inteiro.
DO $$
DECLARE
  tabelas text[] := ARRAY[
    'Insumo', 'Loja', 'Marca', 'Colaborador', 'Fornecedor', 'InsumoVariante',
    'FichaTecnica', 'FichaItem', 'ProdutoVenda', 'ProdutoCanal', 'ProdutoEmbalagem',
    'CanalConfig', 'NotaEntrada', 'NotaEntradaItem', 'SaldoEstoque', 'Contagem',
    'ContagemItem', 'Requisicao', 'RequisicaoItem', 'OrdemProducao', 'Etiqueta',
    'FaturamentoLancamento', 'DreLinha', 'DreMeta', 'Despesa', 'PeriodoApuracao',
    'FarolFaixa', 'MovimentoEstoque', 'HistoricoAlteracao'
  ];
  so_acrescenta text[] := ARRAY['MovimentoEstoque', 'HistoricoAlteracao'];
  t text;
  eu record;
  dono boolean;
  pode_assumir boolean;
BEGIN
  SELECT rolsuper, rolcreaterole INTO eu FROM pg_roles WHERE rolname = current_user;

  -- 1. Dono (direto ou por herança) de todas as tabelas de tenant?
  SELECT bool_and(pg_has_role(current_user, c.relowner, 'USAGE')) INTO dono
    FROM unnest(tabelas) AS n(nome)
    JOIN pg_class c ON c.oid = to_regclass(format('%I', n.nome));
  IF NOT coalesce(dono, false) THEN
    RAISE NOTICE 'ERP RLS NÃO instalada: % não é dono das tabelas de tenant. O portão segue isolando sem o papel erp_tenant.', current_user;
    RETURN;
  END IF;

  -- 2. O papel (é do cluster inteiro: pode já existir).
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    IF NOT (eu.rolsuper OR eu.rolcreaterole) THEN
      RAISE NOTICE 'ERP RLS NÃO instalada: % não pode criar o papel erp_tenant (sem SUPERUSER/CREATEROLE).', current_user;
      RETURN;
    END IF;
    CREATE ROLE erp_tenant NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;

  -- 3. Quem roda o app precisa poder assumir o papel (SET ROLE).
  pode_assumir := CASE WHEN current_setting('server_version_num')::int >= 160000
                       THEN pg_has_role(current_user, 'erp_tenant', 'SET')
                       ELSE pg_has_role(current_user, 'erp_tenant', 'MEMBER') END;
  IF NOT pode_assumir THEN
    BEGIN
      EXECUTE format('GRANT erp_tenant TO %I', current_user);
    EXCEPTION WHEN insufficient_privilege OR invalid_grant_operation THEN
      RAISE NOTICE 'ERP RLS NÃO instalada: % não consegue assumir o papel erp_tenant.', current_user;
      RETURN;
    END;
  END IF;

  -- 4. GRANT mínimo: só as tabelas de tenant (nada do portal, nem ParceiroFlow,
  --    nem User). Livro-razão e histórico: só ler e acrescentar.
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO erp_tenant', current_schema());
  EXECUTE 'GRANT EXECUTE ON FUNCTION "erp_exigir_parceiro_ativo"(text) TO erp_tenant';
  FOREACH t IN ARRAY tabelas LOOP
    IF t = ANY(so_acrescenta) THEN
      EXECUTE format('GRANT SELECT, INSERT ON %I TO erp_tenant', t);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO erp_tenant', t);
    END IF;

    -- 5. RLS ligada e FORÇADA, uma política por tabela: a linha é do parceiro do contexto.
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_do_parceiro', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL TO erp_tenant '
      'USING ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), '''')) '
      'WITH CHECK ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), ''''))',
      t || '_do_parceiro', t
    );
  END LOOP;
  RAISE NOTICE 'ERP RLS instalada nas % tabelas de tenant.', array_length(tabelas, 1);
END $$;
