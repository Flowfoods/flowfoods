-- ERP 3.2 — A lista do dia: o que a loja vai produzir num dia, cruzada com o estoque (vai usar / tem / comprar).
-- Decisões 218 a 227.
--
-- ADITIVA: duas tabelas novas de tenant ("ListaProducao" e "ListaProducaoItem"), nenhuma coluna mexida nas antigas.
-- As tabelas nascem vazias: os CHECKs entram validados de nascença (não há linha antiga para violar) e os índices únicos
-- não podem falhar. Nenhum passo lê tabela de tenant (lição da 2.1: o dono com FORCE RLS enxerga 0 linhas).
--
-- Segura para superusuário e para dono NÃO-superusuário, com ou sem RLS: o bloco da RLS é o mesmo padrão condicional da
-- 0.2, da 2.2a e da 2.2b (se as tabelas antigas JÁ têm RLS e estas não puderem ganhar, a migration para com a frase:
-- tabela sem GRANT para o papel quebraria o ERP em tempo de execução).
--
-- Gatilhos (o cinto além da regra em `producao-lista.ts`):
--  - dono da linha imutável (a função de todas as tabelas de tenant);
--  - a lista não muda de loja nem de dia;
--  - a linha que virou lote (ordem planejada, em produção ou concluída) não muda de ficha, de quantidade nem de lote, e
--    não se apaga (nem pelo apagar da lista): cancele o lote antes; com o lote cancelado ela volta a ser editável;
--  - o lote de uma linha é da MESMA loja da lista, do MESMO dia e da MESMA ficha.
-- Depois do deploy, `npm run erp:conferir-migracao` confere tabelas, RLS, índices e gatilhos.

-- ------------------------------------------------------------ tabelas
CREATE TABLE "ListaProducao" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 0,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadaPorNome" TEXT NOT NULL,
    "atualizadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaPorNome" TEXT NOT NULL,

    CONSTRAINT "ListaProducao_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ListaProducao_versao_naoneg" CHECK ("versao" >= 0),
    CONSTRAINT "ListaProducao_dia_minimo" CHECK ("dia" >= DATE '2020-01-01'),
    CONSTRAINT "ListaProducao_textos_curtos" CHECK (
      char_length("criadaPorNome") BETWEEN 1 AND 120
      AND char_length("atualizadaPorNome") BETWEEN 1 AND 120
    )
);

CREATE TABLE "ListaProducaoItem" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,
    "fichaId" TEXT NOT NULL,
    "fichaNomeSnapshot" TEXT NOT NULL,
    "unidadeSnapshot" "UnidadeBase" NOT NULL,
    "quantidadeMilesimos" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ordemProducaoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListaProducaoItem_pkey" PRIMARY KEY ("id"),
    -- De 1 g/1 ml/1 un a 10 mil kg/L/un: o mesmo teto do "quanto vai produzir" da ficha (3.1).
    CONSTRAINT "ListaProducaoItem_quantidade_faixa" CHECK ("quantidadeMilesimos" BETWEEN 1 AND 10000000),
    CONSTRAINT "ListaProducaoItem_ordem_faixa" CHECK ("ordem" BETWEEN 0 AND 999),
    CONSTRAINT "ListaProducaoItem_textos_curtos" CHECK (char_length("fichaNomeSnapshot") BETWEEN 1 AND 200)
);

CREATE UNIQUE INDEX "ListaProducao_parceiroId_id_key" ON "ListaProducao"("parceiroId", "id");
-- Uma lista por loja e dia: dois cliques ou duas abas que criam juntos caem na mesma.
CREATE UNIQUE INDEX "ListaProducao_parceiroId_lojaId_dia_key" ON "ListaProducao"("parceiroId", "lojaId", "dia");
CREATE UNIQUE INDEX "ListaProducaoItem_parceiroId_id_key" ON "ListaProducaoItem"("parceiroId", "id");
-- Uma linha, um lote: o mesmo lote não serve a duas linhas (nulo = a linha ainda não virou lote).
CREATE UNIQUE INDEX "ListaProducaoItem_parceiroId_ordemProducaoId_key" ON "ListaProducaoItem"("parceiroId", "ordemProducaoId");
CREATE INDEX "ListaProducaoItem_parceiroId_listaId_idx" ON "ListaProducaoItem"("parceiroId", "listaId");
CREATE INDEX "ListaProducaoItem_parceiroId_fichaId_idx" ON "ListaProducaoItem"("parceiroId", "fichaId");

ALTER TABLE "ListaProducao" ADD CONSTRAINT "ListaProducao_parceiroId_fkey"
  FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ListaProducao" ADD CONSTRAINT "ListaProducao_parceiroId_lojaId_fkey"
  FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ListaProducaoItem" ADD CONSTRAINT "ListaProducaoItem_parceiroId_fkey"
  FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ListaProducaoItem" ADD CONSTRAINT "ListaProducaoItem_parceiroId_listaId_fkey"
  FOREIGN KEY ("parceiroId", "listaId") REFERENCES "ListaProducao"("parceiroId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListaProducaoItem" ADD CONSTRAINT "ListaProducaoItem_parceiroId_fichaId_fkey"
  FOREIGN KEY ("parceiroId", "fichaId") REFERENCES "FichaTecnica"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ListaProducaoItem" ADD CONSTRAINT "ListaProducaoItem_parceiroId_ordemProducaoId_fkey"
  FOREIGN KEY ("parceiroId", "ordemProducaoId") REFERENCES "OrdemProducao"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------ gatilhos
-- Dono da linha é imutável (a mesma função de todas as tabelas de tenant).
CREATE TRIGGER "ListaProducao_parceiro_imutavel" BEFORE UPDATE ON "ListaProducao"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();
CREATE TRIGGER "ListaProducaoItem_parceiro_imutavel" BEFORE UPDATE ON "ListaProducaoItem"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();

-- A lista é de uma loja num dia: as linhas e os lotes dela apontam isso, então loja e dia não mudam.
CREATE OR REPLACE FUNCTION "erp_lista_producao_loja_dia_imutaveis"() RETURNS trigger AS $$
BEGIN
  IF NEW."lojaId" <> OLD."lojaId" OR NEW."dia" <> OLD."dia" THEN
    RAISE EXCEPTION '[erp] a lista do dia não muda de loja nem de dia (ListaProducao_loja_dia_imutaveis).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ListaProducao_loja_dia_imutaveis" BEFORE UPDATE ON "ListaProducao"
  FOR EACH ROW EXECUTE FUNCTION "erp_lista_producao_loja_dia_imutaveis"();

-- A linha e o lote dela. Debaixo do papel `erp_tenant` as leituras já são do mesmo parceiro (RLS); o WHERE repete o
-- parceiro para valer igual para o superusuário.
CREATE OR REPLACE FUNCTION "erp_lista_producao_item_confere"() RETURNS trigger AS $$
DECLARE
  situacao text;
  o RECORD;
  l RECORD;
BEGIN
  -- 1. A linha que virou lote (planejado, em produção ou concluído) fica como virou: não muda nem se apaga.
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD."ordemProducaoId" IS NOT NULL THEN
    SELECT p."status"::text INTO situacao FROM "OrdemProducao" p WHERE p."parceiroId" = OLD."parceiroId" AND p."id" = OLD."ordemProducaoId";
    IF situacao IS DISTINCT FROM 'CANCELADA' THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION '[erp] a linha da lista que virou lote não se apaga: cancele o lote antes (ListaProducaoItem_com_lote).' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW."ordemProducaoId" IS DISTINCT FROM OLD."ordemProducaoId" OR NEW."fichaId" <> OLD."fichaId"
         OR NEW."quantidadeMilesimos" <> OLD."quantidadeMilesimos" OR NEW."listaId" <> OLD."listaId" THEN
        RAISE EXCEPTION '[erp] a linha da lista que virou lote não muda: cancele o lote antes (ListaProducaoItem_com_lote).' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  -- 2. O lote da linha é da mesma loja e do mesmo dia da lista, e da mesma ficha.
  IF NEW."ordemProducaoId" IS NOT NULL AND (TG_OP = 'INSERT' OR NEW."ordemProducaoId" IS DISTINCT FROM OLD."ordemProducaoId") THEN
    SELECT p."lojaId", p."fichaId", p."dataPlanejada" INTO o FROM "OrdemProducao" p WHERE p."parceiroId" = NEW."parceiroId" AND p."id" = NEW."ordemProducaoId";
    IF NOT FOUND THEN
      RAISE EXCEPTION '[erp] o lote da linha não existe neste parceiro (ListaProducaoItem_lote_confere).' USING ERRCODE = 'check_violation';
    END IF;
    SELECT x."lojaId", x."dia" INTO l FROM "ListaProducao" x WHERE x."parceiroId" = NEW."parceiroId" AND x."id" = NEW."listaId";
    IF NOT FOUND OR o."lojaId" <> l."lojaId" OR o."dataPlanejada" <> l."dia" OR o."fichaId" <> NEW."fichaId" THEN
      RAISE EXCEPTION '[erp] o lote da linha é da mesma loja e do mesmo dia da lista, e da mesma ficha (ListaProducaoItem_lote_confere).' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ListaProducaoItem_lote_confere" BEFORE INSERT OR UPDATE OR DELETE ON "ListaProducaoItem"
  FOR EACH ROW EXECUTE FUNCTION "erp_lista_producao_item_confere"();

-- ------------------------------------------------------------ RLS
-- O mesmo padrão condicional da 0.2, da 2.2a e da 2.2b (só se quem roda pode instalar por inteiro). O papel do tenant lê,
-- inclui, muda e apaga (a lista é editável; o gatilho acima protege a linha que virou lote).
DO $$
DECLARE
  tabela text;
  ja_tem_rls boolean;
  eu record;
  dono boolean;
  pode_assumir boolean;
BEGIN
  SELECT coalesce(relrowsecurity, false) INTO ja_tem_rls FROM pg_class WHERE oid = to_regclass('"Loja"');
  SELECT rolsuper, rolcreaterole INTO eu FROM pg_roles WHERE rolname = current_user;

  FOREACH tabela IN ARRAY ARRAY['ListaProducao', 'ListaProducaoItem'] LOOP
    dono := pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = to_regclass(format('%I', tabela))), 'USAGE');
    IF NOT coalesce(dono, false) THEN
      IF ja_tem_rls THEN RAISE EXCEPTION 'ERP 3.2: % não é dono de "%": a RLS não pode ser instalada nela.', current_user, tabela; END IF;
      RAISE NOTICE 'ERP RLS NÃO instalada em %: % não é dono. O portão segue isolando sem o papel erp_tenant.', tabela, current_user;
      CONTINUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
      IF NOT (eu.rolsuper OR eu.rolcreaterole) THEN
        IF ja_tem_rls THEN RAISE EXCEPTION 'ERP 3.2: o papel erp_tenant não existe e % não pode criá-lo.', current_user; END IF;
        RAISE NOTICE 'ERP RLS NÃO instalada em %: % não pode criar o papel erp_tenant.', tabela, current_user;
        CONTINUE;
      END IF;
      CREATE ROLE erp_tenant NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
    END IF;

    pode_assumir := CASE WHEN current_setting('server_version_num')::int >= 160000
                         THEN pg_has_role(current_user, 'erp_tenant', 'SET')
                         ELSE pg_has_role(current_user, 'erp_tenant', 'MEMBER') END;
    IF NOT pode_assumir THEN
      BEGIN
        EXECUTE format('GRANT erp_tenant TO %I', current_user);
      EXCEPTION WHEN insufficient_privilege OR invalid_grant_operation THEN
        IF ja_tem_rls THEN RAISE EXCEPTION 'ERP 3.2: % não consegue assumir o papel erp_tenant.', current_user; END IF;
        RAISE NOTICE 'ERP RLS NÃO instalada em %: % não consegue assumir o papel erp_tenant.', tabela, current_user;
        CONTINUE;
      END;
    END IF;

    EXECUTE format('GRANT USAGE ON SCHEMA %I TO erp_tenant', current_schema());
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO erp_tenant', tabela);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tabela || '_do_parceiro', tabela);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL TO erp_tenant '
      'USING ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), '''')) '
      'WITH CHECK ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), ''''))',
      tabela || '_do_parceiro', tabela
    );
    RAISE NOTICE 'ERP RLS instalada em %.', tabela;
  END LOOP;
END $$;
