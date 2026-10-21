-- ERP I.1a — Categorias de insumo (natureza do insumo para o CMV), obrigatoriedade e idempotência do cadastro.
-- Decisões 243 a 252.
--
-- ADITIVA: uma tabela nova de tenant ("CategoriaInsumo") e colunas novas, todas anuláveis, em "Insumo". Nada é lido, movido
-- nem apagado. As categorias padrão NÃO nascem aqui: o script `npm run erp:semear-categorias` as cria por parceiro
-- (idempotente, pela chave estável), e a classificação dos insumos antigos é a assistida (prévia, aplicar, reverter), nunca
-- SQL cego. `categoriaId` fica nulo no banco de propósito: o insumo antigo continua legível; a regra (categoria obrigatória
-- em insumo novo e em toda edição) é do servidor.
--
-- Segura para superusuário e para dono NÃO-superusuário, com ou sem FORCE RLS: nenhum passo lê tabela de tenant (lição da
-- 2.1: o dono com FORCE RLS enxerga 0 linhas). A tabela nova nasce vazia (CHECKs validados de nascença); os CHECKs das
-- colunas novas de "Insumo" entram NOT VALID e logo se tenta o VALIDATE (só lê, não passa pela RLS); linha antiga que viole
-- não reprova a migration, deixa o CHECK NOT VALID e avisa (WARNING). A FK composta nasce com a coluna toda nula, então a
-- validação dela não depende de nenhuma linha. O bloco da RLS é o padrão condicional da 0.2 (se as tabelas antigas JÁ têm
-- RLS e esta não puder ganhar, a migration para com a frase: tabela sem GRANT para o papel quebraria o ERP).
--
-- Nomes iguais por caixa ou acento ("Farinha" e "farinha") que já existam NÃO quebram nada: o índice único de nome não
-- muda; a regra nova (nome único sem diferenciar maiúscula nem acento) vale para o que for cadastrado daqui para a frente,
-- e `npm run erp:classificar-insumos -- --previa` lista os que já estão parecidos para a casa juntar ou renomear.
-- Depois do deploy, `npm run erp:conferir-migracao` confere a tabela, a RLS, os índices, os gatilhos e os CHECKs.

-- ------------------------------------------------------------ tabela
CREATE TABLE "CategoriaInsumo" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "chave" TEXT,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desativadaEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriaInsumo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CategoriaInsumo_nome_curto" CHECK (char_length("nome") BETWEEN 1 AND 60 AND "nome" = btrim("nome")),
    CONSTRAINT "CategoriaInsumo_ordem_faixa" CHECK ("ordem" BETWEEN 0 AND 999),
    CONSTRAINT "CategoriaInsumo_chave_curta" CHECK ("chave" IS NULL OR char_length("chave") BETWEEN 1 AND 30),
    -- A do sistema é uma das padrão (tem chave) e nunca fica desativada.
    CONSTRAINT "CategoriaInsumo_sistema_tem_chave" CHECK (NOT "sistema" OR "chave" IS NOT NULL),
    CONSTRAINT "CategoriaInsumo_sistema_ativa" CHECK (NOT "sistema" OR "ativa"),
    -- Desativada tem a data em que foi; ativa não tem.
    CONSTRAINT "CategoriaInsumo_desativada_tem_data" CHECK ("ativa" = ("desativadaEm" IS NULL))
);

CREATE UNIQUE INDEX "CategoriaInsumo_parceiroId_id_key" ON "CategoriaInsumo"("parceiroId", "id");
-- O nome não repete na casa; a regra do servidor ainda não deixa repetir por caixa ou acento.
CREATE UNIQUE INDEX "CategoriaInsumo_parceiroId_nome_key" ON "CategoriaInsumo"("parceiroId", "nome");
-- A identidade da padrão: a semeadura repetida cai aqui (nulo não repete: as criadas pela casa não têm chave).
CREATE UNIQUE INDEX "CategoriaInsumo_parceiroId_chave_key" ON "CategoriaInsumo"("parceiroId", "chave");
CREATE INDEX "CategoriaInsumo_parceiroId_ordem_idx" ON "CategoriaInsumo"("parceiroId", "ordem");

ALTER TABLE "CategoriaInsumo" ADD CONSTRAINT "CategoriaInsumo_parceiroId_fkey"
  FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------ colunas do insumo
ALTER TABLE "Insumo" ADD COLUMN "categoriaId" TEXT;
ALTER TABLE "Insumo" ADD COLUMN "classificadoPor" TEXT;
ALTER TABLE "Insumo" ADD COLUMN "classificacaoMotivo" TEXT;
ALTER TABLE "Insumo" ADD COLUMN "classificacaoLote" TEXT;
ALTER TABLE "Insumo" ADD COLUMN "classificadoEm" TIMESTAMP(3);
ALTER TABLE "Insumo" ADD COLUMN "chaveEnvio" TEXT;
ALTER TABLE "Insumo" ADD COLUMN "hashEnvio" TEXT;

-- Chave de envio única por parceiro (nulo não repete: o insumo antigo e o que vem de fora do formulário não têm chave).
CREATE UNIQUE INDEX "Insumo_parceiroId_chaveEnvio_key" ON "Insumo"("parceiroId", "chaveEnvio");
CREATE INDEX "Insumo_parceiroId_categoriaId_idx" ON "Insumo"("parceiroId", "categoriaId");

-- FK composta (parceiro, categoria): o banco recusa categoria de outro parceiro, mesmo por SQL cru. MATCH SIMPLE: com a
-- categoria nula a FK não confere nada (o insumo antigo).
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_parceiroId_categoriaId_fkey"
  FOREIGN KEY ("parceiroId", "categoriaId") REFERENCES "CategoriaInsumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------ CHECKs do insumo (NOT VALID)
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_classificadoPor_valido"
  CHECK ("classificadoPor" IS NULL OR "classificadoPor" IN ('MANUAL', 'SUGESTAO', 'MIGRACAO')) NOT VALID;
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_classificacaoMotivo_curto"
  CHECK ("classificacaoMotivo" IS NULL OR char_length("classificacaoMotivo") <= 200) NOT VALID;
-- Quem diz como foi classificado tem categoria (sem categoria não há o que dizer).
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_classificacao_so_com_categoria"
  CHECK ("categoriaId" IS NOT NULL OR ("classificadoPor" IS NULL AND "classificacaoMotivo" IS NULL AND "classificacaoLote" IS NULL AND "classificadoEm" IS NULL)) NOT VALID;
-- Só o lote da classificação assistida tem lote.
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_classificacaoLote_da_migracao"
  CHECK ("classificacaoLote" IS NULL OR ("classificadoPor" = 'MIGRACAO' AND char_length("classificacaoLote") BETWEEN 1 AND 60)) NOT VALID;
-- Chave e impressão vêm juntas, e a chave tem um tamanho que sirva de UUID.
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_chaveEnvio_completa"
  CHECK (("chaveEnvio" IS NULL) = ("hashEnvio" IS NULL) AND ("chaveEnvio" IS NULL OR char_length("chaveEnvio") BETWEEN 8 AND 80)) NOT VALID;

-- ------------------------------------------------------------ validar o que já existe
DO $$
DECLARE
  alvo text;
BEGIN
  FOREACH alvo IN ARRAY ARRAY[
    'Insumo_classificadoPor_valido',
    'Insumo_classificacaoMotivo_curto',
    'Insumo_classificacao_so_com_categoria',
    'Insumo_classificacaoLote_da_migracao',
    'Insumo_chaveEnvio_completa'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE "Insumo" VALIDATE CONSTRAINT %I', alvo);
    EXCEPTION WHEN check_violation THEN
      RAISE WARNING 'ERP I.1a: o CHECK % ficou NOT VALID (linha antiga em Insumo, corrija e rode VALIDATE CONSTRAINT); vale para toda escrita nova.', alvo;
    END;
  END LOOP;
END $$;

-- ------------------------------------------------------------ gatilhos
-- Dono da linha é imutável (a mesma função de todas as tabelas de tenant).
CREATE TRIGGER "CategoriaInsumo_parceiro_imutavel" BEFORE UPDATE ON "CategoriaInsumo"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();

-- "Outros / a classificar" é do sistema: não se exclui, não se desativa, não se renomeia e não perde a identidade.
CREATE OR REPLACE FUNCTION "erp_categoria_insumo_sistema_protegida"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."sistema" THEN
      RAISE EXCEPTION '[erp] a categoria do sistema não se exclui (CategoriaInsumo_sistema_protegida).' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."sistema" AND (NEW."nome" <> OLD."nome" OR NEW."ativa" <> OLD."ativa" OR NEW."sistema" <> OLD."sistema" OR NEW."chave" IS DISTINCT FROM OLD."chave") THEN
    RAISE EXCEPTION '[erp] a categoria do sistema não se renomeia nem se desativa (CategoriaInsumo_sistema_protegida).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CategoriaInsumo_sistema_protegida" BEFORE UPDATE OR DELETE ON "CategoriaInsumo"
  FOR EACH ROW EXECUTE FUNCTION "erp_categoria_insumo_sistema_protegida"();

-- ------------------------------------------------------------ RLS
-- O mesmo padrão condicional da 0.2, da 2.2a, da 2.2b e da 3.2 (só se quem roda pode instalar por inteiro). O papel do
-- tenant lê, inclui, muda e apaga (a categoria é editável; o gatilho acima protege a do sistema e a FK protege a que tem uso).
DO $$
DECLARE
  tabela text := 'CategoriaInsumo';
  ja_tem_rls boolean;
  eu record;
  dono boolean;
  pode_assumir boolean;
BEGIN
  SELECT coalesce(relrowsecurity, false) INTO ja_tem_rls FROM pg_class WHERE oid = to_regclass('"Loja"');
  SELECT rolsuper, rolcreaterole INTO eu FROM pg_roles WHERE rolname = current_user;

  dono := pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = to_regclass(format('%I', tabela))), 'USAGE');
  IF NOT coalesce(dono, false) THEN
    IF ja_tem_rls THEN RAISE EXCEPTION 'ERP I.1a: % não é dono de "%": a RLS não pode ser instalada nela.', current_user, tabela; END IF;
    RAISE NOTICE 'ERP RLS NÃO instalada em %: % não é dono. O portão segue isolando sem o papel erp_tenant.', tabela, current_user;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    IF NOT (eu.rolsuper OR eu.rolcreaterole) THEN
      IF ja_tem_rls THEN RAISE EXCEPTION 'ERP I.1a: o papel erp_tenant não existe e % não pode criá-lo.', current_user; END IF;
      RAISE NOTICE 'ERP RLS NÃO instalada em %: % não pode criar o papel erp_tenant.', tabela, current_user;
      RETURN;
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
      IF ja_tem_rls THEN RAISE EXCEPTION 'ERP I.1a: % não consegue assumir o papel erp_tenant.', current_user; END IF;
      RAISE NOTICE 'ERP RLS NÃO instalada em %: % não consegue assumir o papel erp_tenant.', tabela, current_user;
      RETURN;
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
END $$;
