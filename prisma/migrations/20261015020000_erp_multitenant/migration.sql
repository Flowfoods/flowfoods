-- ERP 0.2 — Multi-tenant: defesa em profundidade no BANCO (Row-Level Security).
--
-- Só ADITIVA: nenhuma coluna, tabela ou índice muda. Cria um papel sem login,
-- dá a ele o mínimo nas 29 tabelas de tenant e liga RLS nelas.
--
-- Como funciona (padrão prisma-client-extensions/row-level-security):
--   o portão (`src/lib/erp/tenant.ts`) roda TODA operação de parceiro numa
--   transação que começa com
--     SELECT set_config('app.parceiro_id', <id>, true),
--            set_config('role', 'erp_tenant', true)
--   (`true` = vale só até o fim da transação). Dali em diante, até SQL cru dentro
--   desse contexto só enxerga e só grava linhas daquele parceiro.
--
-- Por que o papel: o usuário do Postgres do app é SUPERUSER (docker-compose) e
-- superusuário IGNORA RLS, mesmo com FORCE. Debaixo de `erp_tenant` (sem
-- BYPASSRLS), a política vale. Sem `app.parceiro_id` setado, a política compara
-- com NULL e nada aparece (negação por padrão).
--
-- O que NÃO muda: migrations e o `prisma` do portal continuam como o usuário do
-- app (superusuário), fora do papel — por isso as migrations não quebram.
-- Limite honesto: `set_config`/`RESET ROLE` também são SQL; isto protege contra
-- consulta que ESQUECE o filtro, não contra quem escreve SQL para fugir dele.

-- 1. Papel sem login. Papel é do cluster inteiro: cria só se não existir
--    (banco de teste, shadow database e reexecução não quebram).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    CREATE ROLE erp_tenant NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END $$;

-- 2. Quem roda o app precisa poder assumir o papel. Superusuário já pode; se um
--    dia o app rodar com usuário comum, ele vira membro aqui.
DO $$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    EXECUTE format('GRANT erp_tenant TO %I', current_user);
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO erp_tenant', current_schema());
END $$;

-- 3. GRANT mínimo: só as tabelas de tenant (nenhuma do portal, nem ParceiroFlow,
--    nem User). Livro-razão e histórico: só ler e acrescentar.
DO $$
DECLARE
  t text;
  dml text[] := ARRAY[
    'Insumo', 'Loja', 'Marca', 'Colaborador', 'Fornecedor', 'InsumoVariante',
    'FichaTecnica', 'FichaItem', 'ProdutoVenda', 'ProdutoCanal', 'ProdutoEmbalagem',
    'CanalConfig', 'NotaEntrada', 'NotaEntradaItem', 'SaldoEstoque', 'Contagem',
    'ContagemItem', 'Requisicao', 'RequisicaoItem', 'OrdemProducao', 'Etiqueta',
    'FaturamentoLancamento', 'DreLinha', 'DreMeta', 'Despesa', 'PeriodoApuracao',
    'FarolFaixa'
  ];
  so_acrescenta text[] := ARRAY['MovimentoEstoque', 'HistoricoAlteracao'];
BEGIN
  FOREACH t IN ARRAY dml LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO erp_tenant', t);
  END LOOP;
  FOREACH t IN ARRAY so_acrescenta LOOP
    EXECUTE format('GRANT SELECT, INSERT ON %I TO erp_tenant', t);
  END LOOP;

  -- 4. RLS ligado e FORÇADO (vale até para o dono que não seja superusuário),
  --    com uma política por tabela: a linha é do parceiro do contexto.
  FOREACH t IN ARRAY dml || so_acrescenta LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL TO erp_tenant '
      'USING ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), '''')) '
      'WITH CHECK ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), ''''))',
      t || '_do_parceiro', t
    );
  END LOOP;
END $$;
