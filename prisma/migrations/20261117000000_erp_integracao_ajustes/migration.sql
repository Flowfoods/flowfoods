-- Central de Integrações, recheque da revisão independente (decisão 488). ADITIVA: troca o corpo de uma função de gatilho.
-- Nenhum passo lê tabela de tenant. Segura para superusuário e para dono NÃO-superusuário, com ou sem RLS.
--
--  - O módulo, ao passar para ATIVO (ativar ou retomar), confere de novo se o ambiente da conexão combina com a marca de
--    homologação do parceiro: trocada a marca, o módulo existente não ativa (antes, só o módulo novo era recusado).
--  - O search_path seguro (`<schema>, pg_temp`) vai na própria função (SET ... FROM CURRENT com o caminho fechado nesta
--    sessão), não só num ALTER depois: uma troca futura do corpo que esqueça o ALTER não volta a abrir a brecha.

DO $$
BEGIN
  EXECUTE format('SET search_path = %I, pg_temp', current_schema());
END $$;

CREATE OR REPLACE FUNCTION "erp_integracao_modulo_confere"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
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
  IF TG_OP = 'INSERT' AND (app."provedor" <> conexao."provedor" OR app."ambiente" <> conexao."ambiente" OR NOT (NEW."modulo" = ANY(app."modulos"))) THEN
    RAISE EXCEPTION '[erp] o app não serve a esta conexão: outro provedor, outro ambiente ou sem o módulo %.', NEW."modulo"
      USING ERRCODE = 'check_violation';
  END IF;
  -- Ao nascer e ao ativar: o ambiente da conexão ainda combina com a marca de homologação do parceiro.
  SELECT p."homologacaoDeIntegracao" INTO homologacao FROM "ParceiroFlow" p WHERE p."id" = NEW."parceiroId";
  IF homologacao IS NULL OR (conexao."ambiente" = 'TEST') <> homologacao THEN
    RAISE EXCEPTION '[erp] o ambiente da conexão não combina mais com o parceiro (marca de homologação): desligue a conexão.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."estado" = 'ATIVO' AND conexao."ambiente" = 'PRODUCAO' AND app."estadoHomologacao" <> 'HOMOLOGADO' THEN
    RAISE EXCEPTION '[erp] em produção, o módulo só ativa com o app homologado pelo provedor.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

RESET search_path;
