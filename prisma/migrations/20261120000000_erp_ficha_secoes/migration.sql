-- Fichas 3A: taxonomia própria, opcional, sem seed/backfill ou mudança de receita/preço.
-- Duas tabelas vazias e duas colunas nulas; nenhum SELECT de dados tenant durante a migração.
-- A normalização acompanha limparTexto/chaveDoNome: NFC, invisíveis/controles removidos,
-- espaços Unicode colapsados e as mesmas letras acentuadas traduzidas antes do lowercase.
CREATE FUNCTION "erp_limpar_nome_classificacao_ficha"(valor text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(normalize(valor, NFC),
      U&'[\00AD\034F\061C\115F\1160\17B4\17B5\180B-\180F\200B-\200F\202A-\202E\2060-\206F\3164\FE00-\FE0F\FEFF\FFA0\0001-\0008\000B\000C\000E-\001F\007F-\009F]', '', 'g'),
    U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000]+', ' ', 'g'));
$$;

CREATE FUNCTION "erp_chave_nome_classificacao_ficha"(valor text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT lower(translate("erp_limpar_nome_classificacao_ficha"(valor),
    'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaaeeeeiiiiooooouuuucnaaaaaaeeeeiiiiooooouuuucn'));
$$;

CREATE TABLE "SecaoFicha" (
  "id" TEXT NOT NULL,
  "parceiroId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "nomeChave" TEXT NOT NULL DEFAULT '',
  "ativa" BOOLEAN NOT NULL DEFAULT true,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecaoFicha_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SecaoFicha_nome_valido" CHECK (char_length("nome") BETWEEN 2 AND 80 AND "nome" = "erp_limpar_nome_classificacao_ficha"("nome")),
  CONSTRAINT "SecaoFicha_nomeChave_coerente" CHECK ("nomeChave" = "erp_chave_nome_classificacao_ficha"("nome") AND "nomeChave" <> '')
);
CREATE TABLE "SubsecaoFicha" (
  "id" TEXT NOT NULL,
  "parceiroId" TEXT NOT NULL,
  "secaoId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "nomeChave" TEXT NOT NULL DEFAULT '',
  "ativa" BOOLEAN NOT NULL DEFAULT true,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubsecaoFicha_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubsecaoFicha_nome_valido" CHECK (char_length("nome") BETWEEN 2 AND 80 AND "nome" = "erp_limpar_nome_classificacao_ficha"("nome")),
  CONSTRAINT "SubsecaoFicha_nomeChave_coerente" CHECK ("nomeChave" = "erp_chave_nome_classificacao_ficha"("nome") AND "nomeChave" <> '')
);
CREATE UNIQUE INDEX "SecaoFicha_parceiroId_id_key" ON "SecaoFicha"("parceiroId", "id");
CREATE UNIQUE INDEX "SecaoFicha_parceiroId_nomeChave_key" ON "SecaoFicha"("parceiroId", "nomeChave");
CREATE UNIQUE INDEX "SubsecaoFicha_parceiroId_id_key" ON "SubsecaoFicha"("parceiroId", "id");
CREATE UNIQUE INDEX "SubsecaoFicha_parceiroId_secaoId_id_key" ON "SubsecaoFicha"("parceiroId", "secaoId", "id");
CREATE UNIQUE INDEX "SubsecaoFicha_parceiroId_secaoId_nomeChave_key" ON "SubsecaoFicha"("parceiroId", "secaoId", "nomeChave");
ALTER TABLE "SecaoFicha" ADD CONSTRAINT "SecaoFicha_parceiroId_fkey"
  FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubsecaoFicha" ADD CONSTRAINT "SubsecaoFicha_parceiroId_fkey"
  FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubsecaoFicha" ADD CONSTRAINT "SubsecaoFicha_parceiroId_secaoId_fkey"
  FOREIGN KEY ("parceiroId", "secaoId") REFERENCES "SecaoFicha"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "FichaTecnica" ADD COLUMN "secaoId" TEXT;
ALTER TABLE "FichaTecnica" ADD COLUMN "subsecaoId" TEXT;
CREATE INDEX "FichaTecnica_parceiroId_secaoId_idx" ON "FichaTecnica"("parceiroId", "secaoId");
CREATE INDEX "FichaTecnica_parceiroId_secaoId_subsecaoId_idx" ON "FichaTecnica"("parceiroId", "secaoId", "subsecaoId");
ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_classificacao_par_completo"
  CHECK ("subsecaoId" IS NULL OR "secaoId" IS NOT NULL);
ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_parceiroId_secaoId_fkey"
  FOREIGN KEY ("parceiroId", "secaoId") REFERENCES "SecaoFicha"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- A terceira coluna impede um filho de outra seção; o CHECK fecha o bypass de NULL do MATCH SIMPLE.
ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_parceiroId_secaoId_subsecaoId_fkey"
  FOREIGN KEY ("parceiroId", "secaoId", "subsecaoId") REFERENCES "SubsecaoFicha"("parceiroId", "secaoId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "erp_classificacao_ficha_nome"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."nome" := "erp_limpar_nome_classificacao_ficha"(NEW."nome");
  NEW."nomeChave" := "erp_chave_nome_classificacao_ficha"(NEW."nome");
  RETURN NEW;
END $$;
CREATE FUNCTION "erp_subsecao_ficha_pai_imutavel"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."secaoId" IS DISTINCT FROM OLD."secaoId" THEN
    RAISE EXCEPTION '[erp] a subseção não muda de seção (SubsecaoFicha_secao_imutavel).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SecaoFicha_nome_normalizado" BEFORE INSERT OR UPDATE ON "SecaoFicha" FOR EACH ROW EXECUTE FUNCTION "erp_classificacao_ficha_nome"();
CREATE TRIGGER "SubsecaoFicha_nome_normalizado" BEFORE INSERT OR UPDATE ON "SubsecaoFicha" FOR EACH ROW EXECUTE FUNCTION "erp_classificacao_ficha_nome"();
CREATE TRIGGER "SecaoFicha_parceiro_imutavel" BEFORE UPDATE ON "SecaoFicha" FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();
CREATE TRIGGER "SubsecaoFicha_parceiro_imutavel" BEFORE UPDATE ON "SubsecaoFicha" FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();
CREATE TRIGGER "SubsecaoFicha_secao_imutavel" BEFORE UPDATE ON "SubsecaoFicha" FOR EACH ROW EXECUTE FUNCTION "erp_subsecao_ficha_pai_imutavel"();

-- Padrão dos três perfis suportados: se a base já tem RLS, não admite uma tabela nova sem proteção.
DO $$
DECLARE tabela text; ja_tem_rls boolean; eu record; dono boolean; pode_assumir boolean;
BEGIN
  SELECT coalesce(relrowsecurity, false) INTO ja_tem_rls FROM pg_class WHERE oid = to_regclass('"Loja"');
  SELECT rolsuper, rolcreaterole INTO eu FROM pg_roles WHERE rolname = current_user;
  FOREACH tabela IN ARRAY ARRAY['SecaoFicha', 'SubsecaoFicha'] LOOP
    dono := pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = to_regclass(format('%I', tabela))), 'USAGE');
    IF NOT coalesce(dono, false) THEN
      IF ja_tem_rls THEN RAISE EXCEPTION 'ERP 3A: % não é dono de "%": a RLS não pode ser instalada nela.', current_user, tabela; END IF;
      RAISE NOTICE 'ERP RLS NÃO instalada em %: % não é dono.', tabela, current_user;
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
      IF NOT (eu.rolsuper OR eu.rolcreaterole) THEN
        IF ja_tem_rls THEN RAISE EXCEPTION 'ERP 3A: o papel erp_tenant não existe e % não pode criá-lo.', current_user; END IF;
        RAISE NOTICE 'ERP RLS NÃO instalada em %: % não pode criar erp_tenant.', tabela, current_user;
        CONTINUE;
      END IF;
      CREATE ROLE erp_tenant NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
    END IF;
    pode_assumir := CASE WHEN current_setting('server_version_num')::int >= 160000
      THEN pg_has_role(current_user, 'erp_tenant', 'SET') ELSE pg_has_role(current_user, 'erp_tenant', 'MEMBER') END;
    IF NOT pode_assumir THEN
      BEGIN
        EXECUTE format('GRANT erp_tenant TO %I', current_user);
      EXCEPTION WHEN insufficient_privilege OR invalid_grant_operation THEN
        IF ja_tem_rls THEN RAISE EXCEPTION 'ERP 3A: % não consegue assumir erp_tenant.', current_user; END IF;
        RAISE NOTICE 'ERP RLS NÃO instalada em %: % não consegue assumir erp_tenant.', tabela, current_user;
        CONTINUE;
      END;
    END IF;
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO erp_tenant', current_schema());
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO erp_tenant', tabela);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL TO erp_tenant USING ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), '''')) WITH CHECK ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), ''''))', tabela || '_do_parceiro', tabela);
  END LOOP;
END $$;
