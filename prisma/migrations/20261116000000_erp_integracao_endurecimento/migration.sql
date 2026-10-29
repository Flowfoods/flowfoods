-- INT-1.1 a INT-1.3, rodada de correção da revisão independente (decisão 487). ADITIVA: troca o corpo de duas funções de
-- gatilho, fixa o search_path das três funções SECURITY DEFINER do ERP, acrescenta um gatilho e troca um CHECK por um mais
-- estreito. Nenhum passo lê tabela de tenant (o dono com FORCE RLS enxerga 0 linhas). Segura para superusuário e para dono
-- NÃO-superusuário, com ou sem RLS.
--
--  1. search_path com pg_temp no FIM nas funções SECURITY DEFINER: sem isso, o Postgres procura primeiro as tabelas temporárias
--     da sessão, e o papel do tenant (que pode criar tabela temporária) enganava os gatilhos com um "ParceiroFlow" ou um
--     "IntegracaoApp" falso. Vale também para a função da 0.2 (`erp_exigir_parceiro_ativo`).
--  2. A conexão: a marca de homologação do parceiro é conferida ao ligar e ao mexer numa conexão ativa, mas desligar sempre
--     passa (trocar a marca com conexão ligada não pode prender a conexão ligada).
--  3. O módulo: nasce só em conexão ativa e com o ambiente combinando com o parceiro; ativar exige a conexão ativa (com trava
--     de leitura na linha, contra a corrida com o desligar) e, em PRODUCAO, o app HOMOLOGADO.
--  4. O app: provedor, ambiente, categoria e Client ID não mudam depois de gravados.
--  5. O nome do segredo do app: só `<PROVEDOR>_..._CLIENT_SECRET` (antes, qualquer nome de variável; a chave de cifragem ou a
--     URL do banco iriam ao iFood como segredo do app).

-- ------------------------------------------------------------ 2. a conexão
CREATE OR REPLACE FUNCTION "erp_integracao_conexao_confere"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
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
  -- Desligar sempre passa: a marca do parceiro pode ter mudado depois de ligar.
  IF TG_OP = 'UPDATE' AND NEW."estado" = 'DESLIGADA' THEN
    RETURN NEW;
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

-- ------------------------------------------------------------ 3. o módulo
CREATE OR REPLACE FUNCTION "erp_integracao_modulo_confere"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  app record;
  conexao record;
  homologacao boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."conexaoId" IS DISTINCT FROM OLD."conexaoId" OR NEW."appId" IS DISTINCT FROM OLD."appId"
        OR NEW."modulo" IS DISTINCT FROM OLD."modulo" THEN
      RAISE EXCEPTION '[erp] o módulo da conexão não troca de conexão, app nem módulo.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."estado" <> 'ATIVO' OR OLD."estado" = 'ATIVO' THEN
      RETURN NEW;
    END IF;
  END IF;
  SELECT a."provedor", a."ambiente", a."modulos", a."estadoHomologacao" INTO app FROM "IntegracaoApp" a WHERE a."id" = NEW."appId";
  IF NOT FOUND THEN
    RAISE EXCEPTION '[erp] app do módulo não existe.' USING ERRCODE = 'check_violation';
  END IF;
  -- Trava de leitura na conexão: quem desliga ao mesmo tempo espera esta transação (e então pausa o módulo).
  SELECT c."provedor", c."ambiente", c."estado" INTO conexao FROM "IntegracaoConexao" c
    WHERE c."id" = NEW."conexaoId" AND c."parceiroId" = NEW."parceiroId" FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[erp] conexão do módulo não existe.' USING ERRCODE = 'check_violation';
  END IF;
  IF conexao."estado" <> 'ATIVA' THEN
    RAISE EXCEPTION '[erp] a conexão está desligada: o módulo não nasce nem ativa nela.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF app."provedor" <> conexao."provedor" OR app."ambiente" <> conexao."ambiente" OR NOT (NEW."modulo" = ANY(app."modulos")) THEN
      RAISE EXCEPTION '[erp] o app não serve a esta conexão: outro provedor, outro ambiente ou sem o módulo %.', NEW."modulo"
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT p."homologacaoDeIntegracao" INTO homologacao FROM "ParceiroFlow" p WHERE p."id" = NEW."parceiroId";
    IF homologacao IS NULL OR (conexao."ambiente" = 'TEST') <> homologacao THEN
      RAISE EXCEPTION '[erp] o ambiente da conexão não combina mais com o parceiro (marca de homologação): desligue a conexão.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW."estado" = 'ATIVO' AND conexao."ambiente" = 'PRODUCAO' AND app."estadoHomologacao" <> 'HOMOLOGADO' THEN
    RAISE EXCEPTION '[erp] em produção, o módulo só ativa com o app homologado pelo provedor.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------ 4. o app não muda de identidade
CREATE OR REPLACE FUNCTION "erp_integracao_app_imutavel"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."provedor" IS DISTINCT FROM OLD."provedor" OR NEW."ambiente" IS DISTINCT FROM OLD."ambiente"
      OR NEW."categoria" IS DISTINCT FROM OLD."categoria" OR NEW."clientId" IS DISTINCT FROM OLD."clientId" THEN
    RAISE EXCEPTION '[erp] o app da integração não troca de provedor, ambiente, categoria nem Client ID: cadastre outro app.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS "IntegracaoApp_imutavel" ON "IntegracaoApp";
CREATE TRIGGER "IntegracaoApp_imutavel" BEFORE UPDATE ON "IntegracaoApp"
  FOR EACH ROW EXECUTE FUNCTION "erp_integracao_app_imutavel"();

-- ------------------------------------------------------------ 5. o nome do segredo do app
ALTER TABLE "IntegracaoApp" DROP CONSTRAINT IF EXISTS "IntegracaoApp_nome_do_segredo";
ALTER TABLE "IntegracaoApp" ADD CONSTRAINT "IntegracaoApp_nome_do_segredo" CHECK (
  char_length("nomeDoSegredo") <= 64 AND "nomeDoSegredo" ~ ('^' || "provedor"::text || '_[A-Z0-9]+(_[A-Z0-9]+)*_CLIENT_SECRET$')
);

-- ------------------------------------------------------------ 1. search_path das funções SECURITY DEFINER (pg_temp no fim)
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['"erp_integracao_conexao_confere"()', '"erp_integracao_modulo_confere"()', '"erp_exigir_parceiro_ativo"(text)'] LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = %I, pg_temp', f, current_schema());
  END LOOP;
END $$;
