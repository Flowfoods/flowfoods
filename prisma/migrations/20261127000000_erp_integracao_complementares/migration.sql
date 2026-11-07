-- INT-1.8D: horário e primeiro pedido por merchant; sem pessoas únicas, conversão de fuso ou escrita financeira.
ALTER TABLE "IntegracaoExecucao" DROP CONSTRAINT "IntegracaoExecucao_perfil_tipo";
ALTER TABLE "IntegracaoExecucao" ADD CONSTRAINT "IntegracaoExecucao_perfil_tipo" CHECK (
  ("perfil" IN ('diario','pagamentos','complementares') AND "tipo" IN ('D1','REVISAO','HISTORICO')) OR ("perfil"='acesso' AND "tipo"='ACESSO')
);
CREATE TABLE "IntegracaoDistribuicaoSnapshot" (
  "id" TEXT NOT NULL,
  "parceiroId" TEXT NOT NULL,
  "execucaoId" TEXT NOT NULL,
  "geracao" INTEGER NOT NULL,
  "paginaInicial" INTEGER NOT NULL DEFAULT 1,
  "versaoContrato" INTEGER NOT NULL,
  "situacao" TEXT NOT NULL,
  "horarios" JSONB,
  "primeirosPedidos" JSONB,
  "hash" TEXT NOT NULL,
  "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegracaoDistribuicaoSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ICompSnapshot_identidade" CHECK ("geracao" > 0 AND "paginaInicial" = 1 AND "versaoContrato" = 1 AND "hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ICompSnapshot_estado" CHECK ("situacao" IN ('PUBLICADO','PENDENTE_PERIODO')),
  CONSTRAINT "ICompSnapshot_horarios" CHECK ("horarios" IS NULL OR jsonb_typeof("horarios") = 'array'),
  CONSTRAINT "ICompSnapshot_primeiros_pedidos" CHECK ("primeirosPedidos" IS NULL OR jsonb_typeof("primeirosPedidos") = 'array'),
  CONSTRAINT "ICompSnapshot_parceiro_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ICompSnapshot_execucao_fkey" FOREIGN KEY ("parceiroId","execucaoId") REFERENCES "IntegracaoExecucao"("parceiroId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ICompSnapshot_payload_fkey" FOREIGN KEY ("parceiroId","execucaoId","geracao","paginaInicial") REFERENCES "IntegracaoPayload"("parceiroId","execucaoId","geracao","pagina") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ICompSnapshot_tenant_key" ON "IntegracaoDistribuicaoSnapshot" ("parceiroId","id");
CREATE UNIQUE INDEX "ICompSnapshot_geracao_key" ON "IntegracaoDistribuicaoSnapshot" ("parceiroId","execucaoId","geracao");
CREATE INDEX "ICompSnapshot_exec_estado_geracao_idx" ON "IntegracaoDistribuicaoSnapshot" ("parceiroId","execucaoId","situacao","geracao" DESC);
DO $$ BEGIN EXECUTE format('SET search_path = %I, pg_temp', current_schema()); END $$;

-- Reusa apenas a prova estrutural inteira de C; os dois termos têm contrato próprio.
CREATE FUNCTION erp_integracao_complementares_termos(p_agregado jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path FROM CURRENT AS $$
DECLARE entrada record; numero numeric; resultado jsonb := '[]'::jsonb;
BEGIN
  IF p_agregado = 'null'::jsonb THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_agregado) IS DISTINCT FROM 'object' OR jsonb_typeof(p_agregado->'value') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Mapa complementar fora do contrato.' USING ERRCODE = 'check_violation', CONSTRAINT = 'ICompSnapshot_contrato';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_agregado) k WHERE k NOT IN ('value','cardinality'))
    OR (SELECT count(*) FROM jsonb_each(p_agregado->'value')) > 2000 THEN
    RAISE EXCEPTION 'Mapa complementar fora do limite.' USING ERRCODE = 'check_violation', CONSTRAINT = 'ICompSnapshot_contrato';
  END IF;
  IF p_agregado ? 'cardinality' AND p_agregado->'cardinality' <> 'null'::jsonb THEN
    IF jsonb_typeof(p_agregado->'cardinality') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Cardinalidade complementar inválida.' USING ERRCODE = 'check_violation', CONSTRAINT = 'ICompSnapshot_contrato';
    END IF;
    numero := (p_agregado->>'cardinality')::numeric;
    IF numero <> trunc(numero) OR numero NOT BETWEEN 0 AND 9007199254740991 THEN
      RAISE EXCEPTION 'Cardinalidade complementar inválida.' USING ERRCODE = 'check_violation', CONSTRAINT = 'ICompSnapshot_contrato';
    END IF;
  END IF;
  FOR entrada IN SELECT key,value FROM jsonb_each(p_agregado->'value') ORDER BY key COLLATE "C" LOOP
    IF octet_length(entrada.key) NOT BETWEEN 1 AND 800 OR jsonb_typeof(entrada.value) IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Termo complementar inválido.' USING ERRCODE = 'check_violation', CONSTRAINT = 'ICompSnapshot_contrato';
    END IF;
    numero := entrada.value::text::numeric;
    IF numero <> trunc(numero) OR numero NOT BETWEEN 0 AND 9007199254740991 THEN
      RAISE EXCEPTION 'Contagem complementar inválida.' USING ERRCODE = 'check_violation', CONSTRAINT = 'ICompSnapshot_contrato';
    END IF;
    resultado := resultado || jsonb_build_array(jsonb_build_object('termo',entrada.key,'ocorrencias',numero::bigint::text));
  END LOOP;
  RETURN resultado;
END $$;

CREATE FUNCTION erp_integracao_complementares_normalizar(p_corpo text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path FROM CURRENT AS $$
DECLARE raw json; corpo jsonb; item jsonb;
BEGIN
  IF p_corpo IS NULL OR octet_length(p_corpo) NOT BETWEEN 1 AND 2097152 THEN
    RAISE EXCEPTION 'Corpo complementar fora do contrato.' USING ERRCODE = 'check_violation', CONSTRAINT = 'ICompSnapshot_contrato';
  END IF;
  raw := p_corpo::json; corpo := p_corpo::jsonb;
  IF NOT erp_integracao_pagamento_json_valido(raw) OR jsonb_typeof(corpo) IS DISTINCT FROM 'object'
    OR (corpo ? 'error' AND corpo->'error' NOT IN ('null'::jsonb,'false'::jsonb))
    OR corpo->'currentPage' IS DISTINCT FROM '1'::jsonb OR corpo->'size' IS DISTINCT FROM '1'::jsonb
    OR corpo->'totalItems' IS DISTINCT FROM '1'::jsonb OR corpo->'totalPages' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(corpo->'data') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Envelope complementar fora do contrato.' USING ERRCODE = 'check_violation', CONSTRAINT = 'ICompSnapshot_contrato';
  END IF;
  IF jsonb_array_length(corpo->'data') <> 1 OR jsonb_typeof(corpo->'data'->0) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Item complementar fora do contrato.' USING ERRCODE = 'check_violation', CONSTRAINT = 'ICompSnapshot_contrato';
  END IF;
  item := corpo->'data'->0;
  IF (SELECT count(*) FROM jsonb_object_keys(item)) <> 2 OR NOT (item ? 'orderCreationHour' AND item ? 'customerFirstOrderInMerchant') THEN
    RAISE EXCEPTION 'Faltam os dois termos complementares.' USING ERRCODE = 'check_violation', CONSTRAINT = 'ICompSnapshot_contrato';
  END IF;
  RETURN jsonb_build_object('horarios',erp_integracao_complementares_termos(item->'orderCreationHour'),
    'primeirosPedidos',erp_integracao_complementares_termos(item->'customerFirstOrderInMerchant'));
END $$;

CREATE FUNCTION erp_integracao_complementares_conferir_corpo(p_parceiro text,p_execucao text,p_geracao int,p_horarios jsonb,p_primeiros_pedidos jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE recibo "IntegracaoPayload"%ROWTYPE; esperado jsonb; recebido jsonb; campo text; valor jsonb;
BEGIN
  IF p_parceiro IS DISTINCT FROM NULLIF(current_setting('app.parceiro_id',true),'')
    OR (SELECT count(*) FROM "IntegracaoPayload" p WHERE p."parceiroId"=p_parceiro AND p."execucaoId"=p_execucao AND p."geracao"=p_geracao) <> 1 THEN
    RAISE EXCEPTION 'A distribuição exige seu recibo completo.' USING ERRCODE = 'check_violation', CONSTRAINT = 'ICompSnapshot_contrato';
  END IF;
  SELECT p.* INTO recibo FROM "IntegracaoPayload" p WHERE p."parceiroId"=p_parceiro AND p."execucaoId"=p_execucao AND p."geracao"=p_geracao AND p."pagina"=1;
  IF NOT FOUND OR recibo.http<>200 OR recibo."versaoContrato" IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Recibo complementar incompatível.' USING ERRCODE = 'check_violation', CONSTRAINT = 'ICompSnapshot_contrato';
  END IF;
  esperado := erp_integracao_complementares_normalizar(recibo."corpoOriginal");
  FOREACH campo IN ARRAY ARRAY['horarios','primeirosPedidos'] LOOP
    valor := CASE WHEN campo='horarios' THEN p_horarios ELSE p_primeiros_pedidos END;
    recebido := NULL;
    IF valor IS NOT NULL THEN
      IF jsonb_typeof(valor) <> 'array' THEN RAISE EXCEPTION 'Termos inválidos.' USING ERRCODE = 'check_violation', CONSTRAINT = 'ICompSnapshot_contrato'; END IF;
      SELECT coalesce(jsonb_agg(v ORDER BY v->>'termo' COLLATE "C"),'[]'::jsonb) INTO recebido FROM jsonb_array_elements(valor) v;
    END IF;
    IF NULLIF(esperado->campo,'null'::jsonb) IS DISTINCT FROM recebido THEN
      RAISE EXCEPTION 'Termos não correspondem à evidência original.' USING ERRCODE = 'check_violation', CONSTRAINT = 'ICompSnapshot_contrato';
    END IF;
  END LOOP;
END $$;

-- Mantém as guardas legadas, acrescentando apenas o vínculo de versão do perfil.
CREATE OR REPLACE FUNCTION erp_integracao_payload_confere() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE execucao "IntegracaoExecucao"%ROWTYPE;
BEGIN
  SELECT e.* INTO execucao FROM "IntegracaoExecucao" e WHERE e."parceiroId" = NEW."parceiroId" AND e."id" = NEW."execucaoId";
  IF NOT FOUND OR NOT erp_integracao_exigir_acesso(NEW."parceiroId", execucao."moduloId", execucao."dono", execucao."perfil" = 'acesso') THEN
    RAISE EXCEPTION 'A coleta da integração não está autorizada nesta execução.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT erp_integracao_fence(NEW."parceiroId", NEW."execucaoId", NEW."geracao", execucao."dono") THEN
    RAISE EXCEPTION 'A execução não possui mais esta janela.' USING ERRCODE = 'check_violation';
  END IF;
  IF (execucao."perfil" IN ('pagamentos','complementares') AND NEW."versaoContrato" IS DISTINCT FROM 1)
    OR (execucao."perfil" NOT IN ('pagamentos','complementares') AND NEW."versaoContrato" IS NOT NULL) THEN
    RAISE EXCEPTION 'Versão incompatível com o perfil da coleta.' USING ERRCODE = 'check_violation', CONSTRAINT = 'IntegracaoPayload_versao_contrato';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION erp_integracao_complementares_snapshot_confere() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE execucao "IntegracaoExecucao"%ROWTYPE;
BEGIN
  -- Prefixo igual ao writer: período antes de controle/conexão/módulo/execução.
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('erp-faturamento:' || NEW."parceiroId", 0));
  SELECT e.* INTO execucao FROM "IntegracaoExecucao" e WHERE e."parceiroId" = NEW."parceiroId" AND e."id" = NEW."execucaoId";
  IF NOT FOUND OR execucao."perfil" <> 'complementares'
    OR NOT erp_integracao_exigir_acesso(NEW."parceiroId", execucao."moduloId", execucao."dono", false)
    OR NOT erp_integracao_fence(NEW."parceiroId", NEW."execucaoId", NEW."geracao", execucao."dono") THEN
    RAISE EXCEPTION 'A publicação marginal perdeu o acesso ou a posse.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."situacao" <> 'PENDENTE_PERIODO' AND EXISTS (SELECT 1 FROM "PeriodoApuracao" p WHERE p."parceiroId" = NEW."parceiroId" AND p."status" = 'FECHADO' AND execucao."dia" BETWEEN p."inicio" AND p."fim") THEN
    RAISE EXCEPTION 'O período fechado exige revisão.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM erp_integracao_complementares_conferir_corpo(NEW."parceiroId", NEW."execucaoId", NEW."geracao", NEW."horarios", NEW."primeirosPedidos");
  RETURN NEW;
END $$;

-- Uma conclusão sem nova fotografia (hash igual) também precisa da mesma prova.
-- Não adquirir o prefixo depois do row lock do UPDATE: o caller deve retê-lo.
CREATE FUNCTION erp_integracao_complementares_execucao_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE chave bigint;
BEGIN
  IF NEW."perfil" <> 'complementares' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."estado" <> 'PLANEJADA' OR NEW."geracao" <> 0 THEN RAISE EXCEPTION 'A janela marginal deve nascer planejada.' USING ERRCODE = 'check_violation'; END IF;
    RETURN NEW;
  END IF;
  IF NEW."estado" NOT IN ('SUCESSO','PENDENTE_PERIODO') THEN RETURN NEW; END IF;
  chave := hashtextextended('erp-faturamento:' || NEW."parceiroId", 0);
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_locks l WHERE l.pid = pg_backend_pid() AND l.database = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
    AND l.locktype = 'advisory' AND l.classid = ((chave >> 32) & 4294967295)::oid AND l.objid = (chave & 4294967295)::oid AND l.objsubid = 1 AND l.granted AND l.mode IN ('ShareLock','ExclusiveLock')) THEN
    RAISE EXCEPTION 'A conclusão marginal exige a trava do período.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."estado" <> 'EXECUTANDO' OR OLD."geracao" <> NEW."geracao"
    OR NOT erp_integracao_exigir_acesso(NEW."parceiroId", NEW."moduloId", OLD."dono", false)
    OR NOT erp_integracao_fence(NEW."parceiroId", NEW."id", NEW."geracao", OLD."dono") THEN
    RAISE EXCEPTION 'A conclusão marginal perdeu o acesso ou a posse.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION erp_integracao_complementares_final() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE dono text; execucao "IntegracaoExecucao"%ROWTYPE; fotografia "IntegracaoDistribuicaoSnapshot"%ROWTYPE;
BEGIN
  SELECT c."donoAtual" INTO dono FROM "IntegracaoControle" c WHERE c."id" = 'IFOOD_ANALYTICS' FOR SHARE;
  IF NOT FOUND OR NOT erp_integracao_posse_viva(dono) THEN RAISE EXCEPTION 'A distribuição perdeu a posse antes de terminar.' USING ERRCODE = 'check_violation'; END IF;
  IF TG_TABLE_NAME = 'IntegracaoExecucao' THEN
    IF dono IS DISTINCT FROM OLD."dono" OR OLD."leaseAte" <= clock_timestamp() THEN RAISE EXCEPTION 'A conclusão marginal perdeu sua concessão.' USING ERRCODE = 'check_violation'; END IF;
    SELECT e.* INTO execucao FROM "IntegracaoExecucao" e WHERE e."parceiroId" = NEW."parceiroId" AND e."id" = NEW."id";
    IF NOT FOUND OR execucao."geracao" <> NEW."geracao" OR execucao."estado" IS DISTINCT FROM NEW."estado" THEN RAISE EXCEPTION 'A conclusão marginal foi substituída.' USING ERRCODE = 'check_violation'; END IF;
    SELECT s.* INTO fotografia FROM "IntegracaoDistribuicaoSnapshot" s WHERE s."parceiroId" = NEW."parceiroId" AND s."execucaoId" = NEW."id"
      AND ((NEW."estado" = 'SUCESSO' AND s."situacao" = 'PUBLICADO') OR (NEW."estado" = 'PENDENTE_PERIODO' AND s."situacao" = 'PENDENTE_PERIODO' AND s."geracao" = NEW."geracao"))
      ORDER BY s."geracao" DESC LIMIT 1;
    IF NOT FOUND OR fotografia."hash" IS DISTINCT FROM NEW."ultimoHash" THEN RAISE EXCEPTION 'A conclusão marginal não corresponde à fotografia.' USING ERRCODE = 'check_violation'; END IF;
    PERFORM erp_integracao_complementares_conferir_corpo(NEW."parceiroId", NEW."id", NEW."geracao", fotografia."horarios", fotografia."primeirosPedidos");
  ELSE
    SELECT e.* INTO execucao FROM "IntegracaoExecucao" e WHERE e."parceiroId" = NEW."parceiroId" AND e."id" = NEW."execucaoId";
    IF NOT FOUND OR execucao."geracao" <> NEW."geracao" OR execucao."ultimoHash" IS DISTINCT FROM NEW."hash"
      OR execucao."estado" IS DISTINCT FROM (CASE WHEN NEW."situacao" = 'PUBLICADO' THEN 'SUCESSO' ELSE 'PENDENTE_PERIODO' END) THEN
      RAISE EXCEPTION 'A fotografia marginal exige conclusão atômica.' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM erp_integracao_complementares_conferir_corpo(NEW."parceiroId", NEW."execucaoId", NEW."geracao", NEW."horarios", NEW."primeirosPedidos");
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER "ICompSnapshot_confere" BEFORE INSERT ON "IntegracaoDistribuicaoSnapshot" FOR EACH ROW EXECUTE FUNCTION erp_integracao_complementares_snapshot_confere();
CREATE TRIGGER "ICompSnapshot_parceiro_imutavel" BEFORE UPDATE ON "IntegracaoDistribuicaoSnapshot" FOR EACH ROW EXECUTE FUNCTION erp_parceiro_imutavel();
CREATE TRIGGER "ICompSnapshot_imutavel" BEFORE UPDATE OR DELETE ON "IntegracaoDistribuicaoSnapshot" FOR EACH ROW EXECUTE FUNCTION erp_integracao_so_inclusao();
CREATE TRIGGER "ICompSnapshot_sem_truncate" BEFORE TRUNCATE ON "IntegracaoDistribuicaoSnapshot" FOR EACH STATEMENT EXECUTE FUNCTION erp_integracao_so_inclusao();
CREATE TRIGGER "ICompExec_guard" BEFORE INSERT OR UPDATE ON "IntegracaoExecucao" FOR EACH ROW EXECUTE FUNCTION erp_integracao_complementares_execucao_guard();
CREATE CONSTRAINT TRIGGER "ICompSnapshot_completude" AFTER INSERT ON "IntegracaoDistribuicaoSnapshot" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_integracao_complementares_final();
CREATE CONSTRAINT TRIGGER "ICompExec_completude" AFTER UPDATE ON "IntegracaoExecucao" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."perfil" = 'complementares' AND NEW."estado" IN ('SUCESSO','PENDENTE_PERIODO')) EXECUTE FUNCTION erp_integracao_complementares_final();

DO $$ DECLARE tem_rls boolean; BEGIN
  SELECT coalesce(relrowsecurity, false) INTO tem_rls FROM pg_class WHERE oid = to_regclass('"Loja"');
  REVOKE ALL ON "IntegracaoDistribuicaoSnapshot" FROM PUBLIC;
  IF tem_rls THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN RAISE EXCEPTION 'INT-1.8D: RLS exige erp_tenant existente.'; END IF;
    ALTER TABLE "IntegracaoDistribuicaoSnapshot" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "IntegracaoDistribuicaoSnapshot" FORCE ROW LEVEL SECURITY;
    CREATE POLICY "ICompSnapshot_do_parceiro" ON "IntegracaoDistribuicaoSnapshot" AS PERMISSIVE FOR ALL TO erp_tenant
      USING ("parceiroId" = NULLIF(current_setting('app.parceiro_id', true), '')) WITH CHECK ("parceiroId" = NULLIF(current_setting('app.parceiro_id', true), ''));
    GRANT SELECT, INSERT ON "IntegracaoDistribuicaoSnapshot" TO erp_tenant;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "IntegracaoDistribuicaoSnapshot" FROM erp_tenant; END IF;
END $$;
REVOKE ALL ON FUNCTION erp_integracao_complementares_termos(jsonb), erp_integracao_complementares_normalizar(text), erp_integracao_complementares_conferir_corpo(text,text,int,jsonb,jsonb), erp_integracao_complementares_snapshot_confere(), erp_integracao_complementares_execucao_guard(), erp_integracao_complementares_final() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    REVOKE ALL ON FUNCTION erp_integracao_complementares_termos(jsonb), erp_integracao_complementares_normalizar(text), erp_integracao_complementares_conferir_corpo(text,text,int,jsonb,jsonb), erp_integracao_complementares_snapshot_confere(), erp_integracao_complementares_execucao_guard(), erp_integracao_complementares_final() FROM erp_tenant;
  END IF;
END $$;
RESET search_path;
