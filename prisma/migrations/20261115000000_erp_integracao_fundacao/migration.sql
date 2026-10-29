-- INT-1.1 — Fundação de dados da Central de Integrações (PRIORIDADE 004, H0 e Onda 1 liberadas por Rodolfo em 28/10/2026).
-- Decisões 481 a 483.
--
-- ADITIVA:
--  - "ParceiroFlow" ganha "homologacaoDeIntegracao" (padrão false): o parceiro de homologação guarda a loja de teste;
--  - duas tabelas GLOBAIS, só do nível 1 e do serviço da integração ("IntegracaoApp", "IntegracaoToken"): o papel do tenant
--    não recebe acesso (REVOKE, como os pedidos da 0.5);
--  - três tabelas de tenant ("IntegracaoConexao", "IntegracaoConexaoModulo", "LiberacaoDeModulo"), com `parceiroId`, FKs
--    compostas, CHECKs de nascença (nascem vazias), gatilhos e RLS + FORCE + política no padrão condicional da 0.2. Sem DELETE
--    para o papel do tenant: desligar e bloquear são mudanças de estado, o histórico fica.
-- Nenhum passo lê tabela de tenant (o dono com FORCE RLS enxerga 0 linhas). Segura para superusuário e para dono
-- NÃO-superusuário, com ou sem RLS.
--
-- O banco é o cinto além da regra (`src/lib/integracoes/core/`):
--  - segredo não entra: o app guarda só o NOME da variável do cofre (formato de variável de ambiente);
--  - uma loja do provedor (merchant do iFood) fica ATIVA num parceiro só, em toda a base (índice único parcial, fora da RLS);
--  - conexão TEST só no parceiro de homologação e PRODUCAO nunca nele (gatilho que lê o parceiro como dono da função);
--  - o módulo numa conexão usa um app do MESMO provedor e ambiente que tem esse módulo (gatilho que lê o app global; sem FK nem
--    relação no Prisma de propósito: relação de modelo global para modelo de tenant abriria leitura pelo cliente do portal);
--  - app não se apaga (gatilho): o registro do módulo continua apontando para ele;
--  - provedor, ambiente, loja e id externo da conexão, e conexão, app e módulo do estado não mudam depois de gravados.

-- ------------------------------------------------------------ o que o Prisma descreve
-- CreateEnum
CREATE TYPE "ProvedorDeIntegracao" AS ENUM ('IFOOD');

-- CreateEnum
CREATE TYPE "AmbienteDeIntegracao" AS ENUM ('TEST', 'PRODUCAO');

-- CreateEnum
CREATE TYPE "CategoriaDeAppIntegracao" AS ENUM ('TEST', 'BI', 'FINANCAS', 'AVALIACOES');

-- CreateEnum
CREATE TYPE "ModuloDeIntegracao" AS ENUM ('ANALYTICS', 'FINANCIAL', 'REVIEW', 'MERCHANT');

-- CreateEnum
CREATE TYPE "HomologacaoDeApp" AS ENUM ('NAO_SE_APLICA', 'PENDENTE', 'EM_ANDAMENTO', 'HOMOLOGADO', 'RECUSADO');

-- CreateEnum
CREATE TYPE "EstadoDaConexao" AS ENUM ('ATIVA', 'DESLIGADA');

-- CreateEnum
CREATE TYPE "EstadoDoModuloDeIntegracao" AS ENUM ('NAO_SOLICITADO', 'SOLICITADO', 'AUTORIZADO', 'ATIVO', 'PAUSADO', 'ERRO_PERMISSAO');

-- AlterTable
ALTER TABLE "ParceiroFlow" ADD COLUMN     "homologacaoDeIntegracao" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "IntegracaoApp" (
    "id" TEXT NOT NULL,
    "provedor" "ProvedorDeIntegracao" NOT NULL,
    "ambiente" "AmbienteDeIntegracao" NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" "CategoriaDeAppIntegracao" NOT NULL,
    "clientId" TEXT NOT NULL,
    "nomeDoSegredo" TEXT NOT NULL,
    "modulos" "ModuloDeIntegracao"[],
    "estadoHomologacao" "HomologacaoDeApp" NOT NULL DEFAULT 'NAO_SE_APLICA',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorNome" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegracaoApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegracaoToken" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "tokenCifrado" TEXT NOT NULL,
    "emitidoEm" TIMESTAMP(3) NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegracaoToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegracaoConexao" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "marcaId" TEXT,
    "provedor" "ProvedorDeIntegracao" NOT NULL,
    "ambiente" "AmbienteDeIntegracao" NOT NULL,
    "idExterno" TEXT NOT NULL,
    "idCurto" TEXT,
    "nomeExterno" TEXT NOT NULL,
    "estado" "EstadoDaConexao" NOT NULL DEFAULT 'ATIVA',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorNome" TEXT NOT NULL,
    "criadoPorUsuarioId" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "desligadaEm" TIMESTAMP(3),
    "desligadaPorNome" TEXT,

    CONSTRAINT "IntegracaoConexao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegracaoConexaoModulo" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "conexaoId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "modulo" "ModuloDeIntegracao" NOT NULL,
    "estado" "EstadoDoModuloDeIntegracao" NOT NULL DEFAULT 'NAO_SOLICITADO',
    "solicitadoEm" TIMESTAMP(3),
    "autorizadoEm" TIMESTAMP(3),
    "verificadoEm" TIMESTAMP(3),
    "ativadoEm" TIMESTAMP(3),
    "ativadoPorNome" TEXT,
    "pausadoEm" TIMESTAMP(3),
    "ultimoErro" TEXT,
    "ultimoErroEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorNome" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegracaoConexaoModulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiberacaoDeModulo" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "liberado" BOOLEAN NOT NULL,
    "mudadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mudadoPorNome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiberacaoDeModulo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoApp_provedor_ambiente_clientId_key" ON "IntegracaoApp"("provedor", "ambiente", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoToken_appId_key" ON "IntegracaoToken"("appId");

-- CreateIndex
CREATE INDEX "IntegracaoConexao_parceiroId_lojaId_idx" ON "IntegracaoConexao"("parceiroId", "lojaId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoConexao_parceiroId_id_key" ON "IntegracaoConexao"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoConexaoModulo_parceiroId_id_key" ON "IntegracaoConexaoModulo"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoConexaoModulo_parceiroId_conexaoId_modulo_key" ON "IntegracaoConexaoModulo"("parceiroId", "conexaoId", "modulo");

-- CreateIndex
CREATE UNIQUE INDEX "LiberacaoDeModulo_parceiroId_id_key" ON "LiberacaoDeModulo"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LiberacaoDeModulo_parceiroId_modulo_key" ON "LiberacaoDeModulo"("parceiroId", "modulo");

-- AddForeignKey
ALTER TABLE "IntegracaoToken" ADD CONSTRAINT "IntegracaoToken_appId_fkey" FOREIGN KEY ("appId") REFERENCES "IntegracaoApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoConexao" ADD CONSTRAINT "IntegracaoConexao_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoConexao" ADD CONSTRAINT "IntegracaoConexao_parceiroId_lojaId_fkey" FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoConexao" ADD CONSTRAINT "IntegracaoConexao_parceiroId_marcaId_fkey" FOREIGN KEY ("parceiroId", "marcaId") REFERENCES "Marca"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoConexaoModulo" ADD CONSTRAINT "IntegracaoConexaoModulo_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoConexaoModulo" ADD CONSTRAINT "IntegracaoConexaoModulo_parceiroId_conexaoId_fkey" FOREIGN KEY ("parceiroId", "conexaoId") REFERENCES "IntegracaoConexao"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiberacaoDeModulo" ADD CONSTRAINT "LiberacaoDeModulo_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------ CHECKs (nascem vazias: validados)
ALTER TABLE "IntegracaoApp"
  ADD CONSTRAINT "IntegracaoApp_textos_curtos" CHECK (
    char_length("nome") BETWEEN 1 AND 80 AND char_length("criadoPorNome") BETWEEN 1 AND 120
  ),
  -- O Client ID é público, mas sem espaço nem quebra (copiado do Developer).
  ADD CONSTRAINT "IntegracaoApp_client_id" CHECK ("clientId" ~ '^[A-Za-z0-9._:-]{1,100}$'),
  -- Só o nome da variável do cofre, nunca o valor do segredo.
  ADD CONSTRAINT "IntegracaoApp_nome_do_segredo" CHECK ("nomeDoSegredo" ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  -- O app de teste é do ambiente TEST e o de produção nunca é da categoria TEST.
  ADD CONSTRAINT "IntegracaoApp_categoria_do_ambiente" CHECK (("categoria" = 'TEST') = ("ambiente" = 'TEST')),
  ADD CONSTRAINT "IntegracaoApp_com_modulo" CHECK (cardinality("modulos") BETWEEN 1 AND 8);

ALTER TABLE "IntegracaoToken"
  ADD CONSTRAINT "IntegracaoToken_cifrado" CHECK (char_length("tokenCifrado") BETWEEN 16 AND 20000),
  ADD CONSTRAINT "IntegracaoToken_prazo" CHECK ("expiraEm" > "emitidoEm");

ALTER TABLE "IntegracaoConexao"
  ADD CONSTRAINT "IntegracaoConexao_textos_curtos" CHECK (
    char_length("nomeExterno") BETWEEN 1 AND 120
    AND ("idCurto" IS NULL OR "idCurto" ~ '^[A-Za-z0-9-]{1,40}$')
    AND char_length("criadoPorNome") BETWEEN 1 AND 120
    AND ("desligadaPorNome" IS NULL OR char_length("desligadaPorNome") BETWEEN 1 AND 120)
  ),
  -- O merchant do iFood é um UUID (minúsculo; a regra normaliza antes de gravar).
  ADD CONSTRAINT "IntegracaoConexao_id_externo" CHECK (
    char_length("idExterno") BETWEEN 1 AND 100
    AND ("provedor" <> 'IFOOD' OR "idExterno" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  ),
  -- Desligada tem quando e quem; ativa não tem.
  ADD CONSTRAINT "IntegracaoConexao_desligada" CHECK (
    ("estado" = 'DESLIGADA') = ("desligadaEm" IS NOT NULL) AND ("desligadaEm" IS NULL) = ("desligadaPorNome" IS NULL)
  );

ALTER TABLE "IntegracaoConexaoModulo"
  ADD CONSTRAINT "IntegracaoConexaoModulo_textos_curtos" CHECK (
    char_length("criadoPorNome") BETWEEN 1 AND 120
    AND ("ativadoPorNome" IS NULL OR char_length("ativadoPorNome") BETWEEN 1 AND 120)
    AND ("ultimoErro" IS NULL OR char_length("ultimoErro") BETWEEN 1 AND 500)
  ),
  -- Ativo tem quem ativou e quando.
  ADD CONSTRAINT "IntegracaoConexaoModulo_ativo_tem_autor" CHECK (
    "estado" <> 'ATIVO' OR ("ativadoEm" IS NOT NULL AND "ativadoPorNome" IS NOT NULL)
  ),
  -- Erro de permissão diz qual foi e quando.
  ADD CONSTRAINT "IntegracaoConexaoModulo_erro_dito" CHECK (
    "estado" <> 'ERRO_PERMISSAO' OR ("ultimoErro" IS NOT NULL AND "ultimoErroEm" IS NOT NULL)
  );

ALTER TABLE "LiberacaoDeModulo"
  ADD CONSTRAINT "LiberacaoDeModulo_modulo" CHECK ("modulo" ~ '^[a-z][a-z0-9-]{1,39}$'),
  ADD CONSTRAINT "LiberacaoDeModulo_autor" CHECK (char_length("mudadoPorNome") BETWEEN 1 AND 120);

-- ------------------------------------------------------------ uma loja do provedor ativa num parceiro só
-- Fora da RLS de propósito: a unicidade vale entre parceiros (o token centralizado enxerga todas as lojas autorizadas; ligar a
-- mesma loja a dois parceiros misturaria os números). Desligada não conta: ligar de novo é linha nova.
CREATE UNIQUE INDEX "IntegracaoConexao_externa_ativa_key" ON "IntegracaoConexao"("provedor", "ambiente", "idExterno") WHERE "estado" = 'ATIVA';
CREATE INDEX "IntegracaoConexaoModulo_parceiroId_appId_idx" ON "IntegracaoConexaoModulo"("parceiroId", "appId");

-- ------------------------------------------------------------ gatilhos
-- O parceiro de cada linha não muda (função da 0.1).
CREATE TRIGGER "IntegracaoConexao_parceiro_imutavel" BEFORE UPDATE ON "IntegracaoConexao"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();
CREATE TRIGGER "IntegracaoConexaoModulo_parceiro_imutavel" BEFORE UPDATE ON "IntegracaoConexaoModulo"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();
CREATE TRIGGER "LiberacaoDeModulo_parceiro_imutavel" BEFORE UPDATE ON "LiberacaoDeModulo"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();

-- A conexão: o ambiente combina com o parceiro (TEST só no de homologação; PRODUCAO nunca nele) e a identidade externa não muda.
-- SECURITY DEFINER: o papel do tenant não lê "ParceiroFlow"; a função lê só a marca de homologação do parceiro da linha.
CREATE OR REPLACE FUNCTION "erp_integracao_conexao_confere"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE
  homologacao boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW."provedor" IS DISTINCT FROM OLD."provedor" OR NEW."ambiente" IS DISTINCT FROM OLD."ambiente"
      OR NEW."idExterno" IS DISTINCT FROM OLD."idExterno" OR NEW."lojaId" IS DISTINCT FROM OLD."lojaId") THEN
    RAISE EXCEPTION '[erp] a conexão não troca de provedor, ambiente, loja do provedor nem loja: desligue e ligue de novo.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."estado" = 'DESLIGADA' AND NEW."estado" <> 'DESLIGADA' THEN
    RAISE EXCEPTION '[erp] conexão desligada não volta: ligue de novo (linha nova).' USING ERRCODE = 'check_violation';
  END IF;
  SELECT p."homologacaoDeIntegracao" INTO homologacao FROM "ParceiroFlow" p WHERE p."id" = NEW."parceiroId";
  IF homologacao IS NULL THEN
    RAISE EXCEPTION '[erp] parceiro da conexão não existe.' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW."ambiente" = 'TEST') <> homologacao THEN
    RAISE EXCEPTION '[erp] conexão de TEST só no parceiro de homologação, e de PRODUCAO nunca nele.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "IntegracaoConexao_confere" BEFORE INSERT OR UPDATE ON "IntegracaoConexao"
  FOR EACH ROW EXECUTE FUNCTION "erp_integracao_conexao_confere"();

-- O módulo numa conexão: o app é do mesmo provedor e ambiente da conexão e tem o módulo; conexão, app e módulo não mudam.
-- SECURITY DEFINER: o papel do tenant não lê "IntegracaoApp" (global). A conexão é a do mesmo parceiro (FK composta).
CREATE OR REPLACE FUNCTION "erp_integracao_modulo_confere"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE
  app record;
  conexao record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."conexaoId" IS DISTINCT FROM OLD."conexaoId" OR NEW."appId" IS DISTINCT FROM OLD."appId"
        OR NEW."modulo" IS DISTINCT FROM OLD."modulo" THEN
      RAISE EXCEPTION '[erp] o módulo da conexão não troca de conexão, app nem módulo.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  SELECT a."provedor", a."ambiente", a."modulos" INTO app FROM "IntegracaoApp" a WHERE a."id" = NEW."appId";
  IF NOT FOUND THEN
    RAISE EXCEPTION '[erp] app do módulo não existe.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT c."provedor", c."ambiente" INTO conexao FROM "IntegracaoConexao" c WHERE c."id" = NEW."conexaoId" AND c."parceiroId" = NEW."parceiroId";
  IF NOT FOUND THEN
    RAISE EXCEPTION '[erp] conexão do módulo não existe.' USING ERRCODE = 'check_violation';
  END IF;
  IF app."provedor" <> conexao."provedor" OR app."ambiente" <> conexao."ambiente" OR NOT (NEW."modulo" = ANY(app."modulos")) THEN
    RAISE EXCEPTION '[erp] o app não serve a esta conexão: outro provedor, outro ambiente ou sem o módulo %.', NEW."modulo"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "IntegracaoConexaoModulo_confere" BEFORE INSERT OR UPDATE ON "IntegracaoConexaoModulo"
  FOR EACH ROW EXECUTE FUNCTION "erp_integracao_modulo_confere"();

-- O app (global) não se apaga: os módulos das conexões guardam o id dele e o histórico cita o nome.
CREATE OR REPLACE FUNCTION "erp_integracao_app_nao_apaga"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '[erp] o app da integração não se apaga: os módulos das conexões apontam para ele.' USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER "IntegracaoApp_nao_apaga" BEFORE DELETE ON "IntegracaoApp"
  FOR EACH ROW EXECUTE FUNCTION "erp_integracao_app_nao_apaga"();

-- ------------------------------------------------------------ RLS das três de tenant (padrão condicional da 0.2)
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

  FOREACH tabela IN ARRAY ARRAY['IntegracaoConexao', 'IntegracaoConexaoModulo', 'LiberacaoDeModulo'] LOOP
    dono := pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = to_regclass(format('%I', tabela))), 'USAGE');
    IF NOT coalesce(dono, false) THEN
      IF ja_tem_rls THEN RAISE EXCEPTION 'ERP INT-1.1: % não é dono de "%": a RLS não pode ser instalada nela.', current_user, tabela; END IF;
      RAISE NOTICE 'ERP RLS NÃO instalada em %: % não é dono. O portão segue isolando sem o papel erp_tenant.', tabela, current_user;
      CONTINUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
      IF NOT (eu.rolsuper OR eu.rolcreaterole) THEN
        IF ja_tem_rls THEN RAISE EXCEPTION 'ERP INT-1.1: o papel erp_tenant não existe e % não pode criá-lo.', current_user; END IF;
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
        IF ja_tem_rls THEN RAISE EXCEPTION 'ERP INT-1.1: % não consegue assumir o papel erp_tenant.', current_user; END IF;
        RAISE NOTICE 'ERP RLS NÃO instalada em %: % não consegue assumir o papel erp_tenant.', tabela, current_user;
        CONTINUE;
      END;
    END IF;

    -- Sem DELETE: desligar a conexão, pausar o módulo e bloquear o módulo do parceiro são estados; o histórico fica.
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO erp_tenant', current_schema());
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO erp_tenant', tabela);
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

-- ------------------------------------------------------------ as globais ficam fora do alcance do tenant
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    RAISE NOTICE 'ERP INT-1.1: papel erp_tenant não existe; nada a revogar.';
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['IntegracaoApp', 'IntegracaoToken'] LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON %I FROM erp_tenant', t);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'ERP INT-1.1: % não pôde revogar % de erp_tenant (sem privilégio); o papel não recebeu GRANT nela.', current_user, t;
    END;
  END LOOP;
END $$;
