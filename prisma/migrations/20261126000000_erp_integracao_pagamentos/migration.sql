-- INT-1.8C: distribuição marginal independente. Não altera fotografia diária,
-- KPI, ponte financeira, habilitações ou dados legados.
ALTER TABLE "IntegracaoExecucao" DROP CONSTRAINT "IntegracaoExecucao_perfil_tipo";
ALTER TABLE "IntegracaoExecucao" ADD CONSTRAINT "IntegracaoExecucao_perfil_tipo" CHECK (
  ("perfil" IN ('diario','pagamentos') AND "tipo" IN ('D1','REVISAO','HISTORICO')) OR ("perfil" = 'acesso' AND "tipo" = 'ACESSO')
);
ALTER TABLE "IntegracaoPayload" ADD COLUMN "versaoContrato" INTEGER;
ALTER TABLE "IntegracaoPayload" ADD CONSTRAINT "IntegracaoPayload_versao_contrato" CHECK ("versaoContrato" IS NULL OR "versaoContrato" = 1);
CREATE INDEX "IExec_perfil_ultimo_inicio_idx" ON "IntegracaoExecucao" ("parceiroId","perfil","iniciadaEm" DESC);

CREATE TABLE "IntegracaoPagamentoSnapshot" (
  "id" TEXT NOT NULL,
  "parceiroId" TEXT NOT NULL,
  "execucaoId" TEXT NOT NULL,
  "geracao" INTEGER NOT NULL,
  "paginaInicial" INTEGER NOT NULL DEFAULT 1,
  "versaoContrato" INTEGER NOT NULL,
  "situacao" TEXT NOT NULL,
  "parcelas" JSONB,
  "hash" TEXT NOT NULL,
  "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegracaoPagamentoSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IPagSnapshot_identidade" CHECK ("geracao" > 0 AND "paginaInicial" = 1 AND "versaoContrato" = 1 AND "hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "IPagSnapshot_estado" CHECK ("situacao" IN ('PUBLICADO','PENDENTE_PERIODO')),
  CONSTRAINT "IPagSnapshot_parcelas" CHECK ("parcelas" IS NULL OR jsonb_typeof("parcelas") = 'array'),
  CONSTRAINT "IPagSnapshot_parceiro_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IPagSnapshot_execucao_fkey" FOREIGN KEY ("parceiroId","execucaoId") REFERENCES "IntegracaoExecucao"("parceiroId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IPagSnapshot_payload_fkey" FOREIGN KEY ("parceiroId","execucaoId","geracao","paginaInicial") REFERENCES "IntegracaoPayload"("parceiroId","execucaoId","geracao","pagina") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "IPagSnapshot_tenant_key" ON "IntegracaoPagamentoSnapshot" ("parceiroId","id");
CREATE UNIQUE INDEX "IPagSnapshot_geracao_key" ON "IntegracaoPagamentoSnapshot" ("parceiroId","execucaoId","geracao");
CREATE INDEX "IPagSnapshot_exec_estado_geracao_idx" ON "IntegracaoPagamentoSnapshot" ("parceiroId","execucaoId","situacao","geracao" DESC);
DO $$ BEGIN EXECUTE format('SET search_path = %I, pg_temp', current_schema()); END $$;

-- json (não jsonb) conserva repetições de chaves, inclusive escapes equivalentes.
-- Todos os números do contrato v1 são inteiros exatos. numeric evita o
-- arredondamento de JSON.parse antes de confrontar a representação normalizada.
CREATE FUNCTION erp_integracao_pagamento_json_valido(p_json json, p_nivel int DEFAULT 0) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path FROM CURRENT AS $$
DECLARE item record; numero numeric; tipo text;
BEGIN
  IF p_json IS NULL OR p_nivel > 32 THEN RETURN false; END IF;
  tipo := json_typeof(p_json);
  IF tipo = 'object' THEN
    IF (SELECT count(*) <> count(DISTINCT key COLLATE "C") FROM json_each(p_json)) THEN RETURN false; END IF;
    FOR item IN SELECT value FROM json_each(p_json) LOOP
      IF NOT erp_integracao_pagamento_json_valido(item.value, p_nivel + 1) THEN RETURN false; END IF;
    END LOOP;
  ELSIF tipo = 'array' THEN
    FOR item IN SELECT value FROM json_array_elements(p_json) LOOP
      IF NOT erp_integracao_pagamento_json_valido(item.value, p_nivel + 1) THEN RETURN false; END IF;
    END LOOP;
  ELSIF tipo = 'number' THEN
    IF length(p_json::text) > 128 THEN RETURN false; END IF;
    numero := p_json::text::numeric;
    IF numero <> trunc(numero) OR numero NOT BETWEEN -9007199254740991 AND 9007199254740991 THEN RETURN false; END IF;
  END IF;
  RETURN true;
EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN RETURN false;
END $$;

-- Retorna SQL NULL para o agregado explicitamente ausente; [] é mapa vazio.
-- A ordem C é apenas canônica dentro do SQL. A comparação não depende da ordem
-- UTF-16 utilizada pelo Node para calcular seu hash dos bytes normalizados.
CREATE FUNCTION erp_integracao_pagamento_normalizar(p_corpo text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path FROM CURRENT AS $$
DECLARE raw json; corpo jsonb; agregado jsonb; entrada record; numero numeric; resultado jsonb := '[]'::jsonb;
BEGIN
  IF p_corpo IS NULL OR octet_length(p_corpo) NOT BETWEEN 1 AND 2097152 THEN
    RAISE EXCEPTION 'Corpo marginal fora do contrato.' USING ERRCODE = 'check_violation', CONSTRAINT = 'IPagSnapshot_contrato';
  END IF;
  raw := p_corpo::json; corpo := p_corpo::jsonb;
  IF NOT erp_integracao_pagamento_json_valido(raw) OR jsonb_typeof(corpo) IS DISTINCT FROM 'object'
    OR (corpo ? 'error' AND corpo->'error' NOT IN ('null'::jsonb,'false'::jsonb))
    OR corpo->'currentPage' IS DISTINCT FROM '1'::jsonb OR corpo->'size' IS DISTINCT FROM '1'::jsonb
    OR corpo->'totalItems' IS DISTINCT FROM '1'::jsonb OR corpo->'totalPages' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(corpo->'data') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Envelope marginal fora do contrato.' USING ERRCODE = 'check_violation', CONSTRAINT = 'IPagSnapshot_contrato';
  END IF;
  IF jsonb_array_length(corpo->'data') <> 1 OR jsonb_typeof(corpo->'data'->0) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Item marginal fora do contrato.' USING ERRCODE = 'check_violation', CONSTRAINT = 'IPagSnapshot_contrato';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(corpo->'data'->0)) <> 1 OR NOT (corpo->'data'->0 ? 'paymentMethod') THEN
    RAISE EXCEPTION 'Agregado marginal fora do contrato.' USING ERRCODE = 'check_violation', CONSTRAINT = 'IPagSnapshot_contrato';
  END IF;
  agregado := corpo->'data'->0->'paymentMethod';
  IF agregado = 'null'::jsonb THEN RETURN NULL; END IF;
  IF jsonb_typeof(agregado) IS DISTINCT FROM 'object' OR jsonb_typeof(agregado->'value') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Mapa marginal fora do contrato.' USING ERRCODE = 'check_violation', CONSTRAINT = 'IPagSnapshot_contrato';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(agregado) k WHERE k NOT IN ('value','cardinality'))
    OR (SELECT count(*) FROM jsonb_each(agregado->'value')) > 2000 THEN
    RAISE EXCEPTION 'Mapa marginal fora do limite.' USING ERRCODE = 'check_violation', CONSTRAINT = 'IPagSnapshot_contrato';
  END IF;
  IF agregado ? 'cardinality' AND agregado->'cardinality' <> 'null'::jsonb THEN
    IF jsonb_typeof(agregado->'cardinality') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Cardinalidade marginal inválida.' USING ERRCODE = 'check_violation', CONSTRAINT = 'IPagSnapshot_contrato';
    END IF;
    numero := (agregado->>'cardinality')::numeric;
    IF numero < 0 THEN RAISE EXCEPTION 'Cardinalidade marginal inválida.' USING ERRCODE = 'check_violation', CONSTRAINT = 'IPagSnapshot_contrato'; END IF;
  END IF;
  FOR entrada IN SELECT key, value FROM jsonb_each(agregado->'value') ORDER BY key COLLATE "C" LOOP
    IF octet_length(entrada.key) NOT BETWEEN 1 AND 800 OR jsonb_typeof(entrada.value) IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Parcela marginal inválida.' USING ERRCODE = 'check_violation', CONSTRAINT = 'IPagSnapshot_contrato';
    END IF;
    numero := entrada.value::text::numeric;
    IF numero < 0 THEN RAISE EXCEPTION 'Contagem marginal inválida.' USING ERRCODE = 'check_violation', CONSTRAINT = 'IPagSnapshot_contrato'; END IF;
    resultado := resultado || jsonb_build_array(jsonb_build_object('metodo', entrada.key, 'ocorrencias', numero::bigint::text));
  END LOOP;
  RETURN resultado;
END $$;

CREATE FUNCTION erp_integracao_pagamento_conferir_corpo(p_parceiro text, p_execucao text, p_geracao int, p_parcelas jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE recibo "IntegracaoPayload"%ROWTYPE; esperado jsonb; recebido jsonb;
BEGIN
  IF p_parceiro IS DISTINCT FROM NULLIF(current_setting('app.parceiro_id', true), '')
    OR (SELECT count(*) FROM "IntegracaoPayload" p WHERE p."parceiroId" = p_parceiro AND p."execucaoId" = p_execucao AND p."geracao" = p_geracao) <> 1 THEN
    RAISE EXCEPTION 'A distribuição exige seu recibo completo.' USING ERRCODE = 'check_violation', CONSTRAINT = 'IPagSnapshot_contrato';
  END IF;
  SELECT p.* INTO recibo FROM "IntegracaoPayload" p WHERE p."parceiroId" = p_parceiro AND p."execucaoId" = p_execucao AND p."geracao" = p_geracao AND p."pagina" = 1;
  IF NOT FOUND OR recibo."http" <> 200 OR recibo."versaoContrato" IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Recibo marginal incompatível.' USING ERRCODE = 'check_violation', CONSTRAINT = 'IPagSnapshot_contrato';
  END IF;
  esperado := erp_integracao_pagamento_normalizar(recibo."corpoOriginal");
  IF p_parcelas IS NOT NULL THEN
    IF jsonb_typeof(p_parcelas) <> 'array' THEN RAISE EXCEPTION 'Parcelas inválidas.' USING ERRCODE = 'check_violation', CONSTRAINT = 'IPagSnapshot_contrato'; END IF;
    SELECT coalesce(jsonb_agg(v ORDER BY v->>'metodo' COLLATE "C"), '[]'::jsonb) INTO recebido FROM jsonb_array_elements(p_parcelas) v;
  END IF;
  IF esperado IS DISTINCT FROM recebido THEN
    RAISE EXCEPTION 'Parcelas não correspondem à evidência original.' USING ERRCODE = 'check_violation', CONSTRAINT = 'IPagSnapshot_contrato';
  END IF;
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
  IF (execucao."perfil" = 'pagamentos' AND NEW."versaoContrato" IS DISTINCT FROM 1)
    OR (execucao."perfil" <> 'pagamentos' AND NEW."versaoContrato" IS NOT NULL) THEN
    RAISE EXCEPTION 'Versão incompatível com o perfil da coleta.' USING ERRCODE = 'check_violation', CONSTRAINT = 'IntegracaoPayload_versao_contrato';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION erp_integracao_pagamento_snapshot_confere() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE execucao "IntegracaoExecucao"%ROWTYPE;
BEGIN
  -- Prefixo igual ao writer: período antes de controle/conexão/módulo/execução.
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('erp-faturamento:' || NEW."parceiroId", 0));
  SELECT e.* INTO execucao FROM "IntegracaoExecucao" e WHERE e."parceiroId" = NEW."parceiroId" AND e."id" = NEW."execucaoId";
  IF NOT FOUND OR execucao."perfil" <> 'pagamentos'
    OR NOT erp_integracao_exigir_acesso(NEW."parceiroId", execucao."moduloId", execucao."dono", false)
    OR NOT erp_integracao_fence(NEW."parceiroId", NEW."execucaoId", NEW."geracao", execucao."dono") THEN
    RAISE EXCEPTION 'A publicação marginal perdeu o acesso ou a posse.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."situacao" <> 'PENDENTE_PERIODO' AND EXISTS (SELECT 1 FROM "PeriodoApuracao" p WHERE p."parceiroId" = NEW."parceiroId" AND p."status" = 'FECHADO' AND execucao."dia" BETWEEN p."inicio" AND p."fim") THEN
    RAISE EXCEPTION 'O período fechado exige revisão.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM erp_integracao_pagamento_conferir_corpo(NEW."parceiroId", NEW."execucaoId", NEW."geracao", NEW."parcelas");
  RETURN NEW;
END $$;

-- Uma conclusão sem nova fotografia (hash igual) também precisa da mesma prova.
-- Não adquirir o prefixo depois do row lock do UPDATE: o caller deve retê-lo.
CREATE FUNCTION erp_integracao_pagamento_execucao_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE chave bigint;
BEGIN
  IF NEW."perfil" <> 'pagamentos' THEN RETURN NEW; END IF;
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

CREATE FUNCTION erp_integracao_pagamento_final() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE dono text; execucao "IntegracaoExecucao"%ROWTYPE; fotografia "IntegracaoPagamentoSnapshot"%ROWTYPE;
BEGIN
  SELECT c."donoAtual" INTO dono FROM "IntegracaoControle" c WHERE c."id" = 'IFOOD_ANALYTICS' FOR SHARE;
  IF NOT FOUND OR NOT erp_integracao_posse_viva(dono) THEN RAISE EXCEPTION 'A distribuição perdeu a posse antes de terminar.' USING ERRCODE = 'check_violation'; END IF;
  IF TG_TABLE_NAME = 'IntegracaoExecucao' THEN
    IF dono IS DISTINCT FROM OLD."dono" OR OLD."leaseAte" <= clock_timestamp() THEN RAISE EXCEPTION 'A conclusão marginal perdeu sua concessão.' USING ERRCODE = 'check_violation'; END IF;
    SELECT e.* INTO execucao FROM "IntegracaoExecucao" e WHERE e."parceiroId" = NEW."parceiroId" AND e."id" = NEW."id";
    IF NOT FOUND OR execucao."geracao" <> NEW."geracao" OR execucao."estado" IS DISTINCT FROM NEW."estado" THEN RAISE EXCEPTION 'A conclusão marginal foi substituída.' USING ERRCODE = 'check_violation'; END IF;
    SELECT s.* INTO fotografia FROM "IntegracaoPagamentoSnapshot" s WHERE s."parceiroId" = NEW."parceiroId" AND s."execucaoId" = NEW."id"
      AND ((NEW."estado" = 'SUCESSO' AND s."situacao" = 'PUBLICADO') OR (NEW."estado" = 'PENDENTE_PERIODO' AND s."situacao" = 'PENDENTE_PERIODO' AND s."geracao" = NEW."geracao"))
      ORDER BY s."geracao" DESC LIMIT 1;
    IF NOT FOUND OR fotografia."hash" IS DISTINCT FROM NEW."ultimoHash" THEN RAISE EXCEPTION 'A conclusão marginal não corresponde à fotografia.' USING ERRCODE = 'check_violation'; END IF;
    PERFORM erp_integracao_pagamento_conferir_corpo(NEW."parceiroId", NEW."id", NEW."geracao", fotografia."parcelas");
  ELSE
    SELECT e.* INTO execucao FROM "IntegracaoExecucao" e WHERE e."parceiroId" = NEW."parceiroId" AND e."id" = NEW."execucaoId";
    IF NOT FOUND OR execucao."geracao" <> NEW."geracao" OR execucao."ultimoHash" IS DISTINCT FROM NEW."hash"
      OR execucao."estado" IS DISTINCT FROM (CASE WHEN NEW."situacao" = 'PUBLICADO' THEN 'SUCESSO' ELSE 'PENDENTE_PERIODO' END) THEN
      RAISE EXCEPTION 'A fotografia marginal exige conclusão atômica.' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM erp_integracao_pagamento_conferir_corpo(NEW."parceiroId", NEW."execucaoId", NEW."geracao", NEW."parcelas");
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER "IPagSnapshot_confere" BEFORE INSERT ON "IntegracaoPagamentoSnapshot" FOR EACH ROW EXECUTE FUNCTION erp_integracao_pagamento_snapshot_confere();
CREATE TRIGGER "IPagSnapshot_parceiro_imutavel" BEFORE UPDATE ON "IntegracaoPagamentoSnapshot" FOR EACH ROW EXECUTE FUNCTION erp_parceiro_imutavel();
CREATE TRIGGER "IPagSnapshot_imutavel" BEFORE UPDATE OR DELETE ON "IntegracaoPagamentoSnapshot" FOR EACH ROW EXECUTE FUNCTION erp_integracao_so_inclusao();
CREATE TRIGGER "IPagSnapshot_sem_truncate" BEFORE TRUNCATE ON "IntegracaoPagamentoSnapshot" FOR EACH STATEMENT EXECUTE FUNCTION erp_integracao_so_inclusao();
CREATE TRIGGER "IPagExec_guard" BEFORE INSERT OR UPDATE ON "IntegracaoExecucao" FOR EACH ROW EXECUTE FUNCTION erp_integracao_pagamento_execucao_guard();
CREATE CONSTRAINT TRIGGER "IPagSnapshot_completude" AFTER INSERT ON "IntegracaoPagamentoSnapshot" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_integracao_pagamento_final();
CREATE CONSTRAINT TRIGGER "IPagExec_completude" AFTER UPDATE ON "IntegracaoExecucao" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."perfil" = 'pagamentos' AND NEW."estado" IN ('SUCESSO','PENDENTE_PERIODO')) EXECUTE FUNCTION erp_integracao_pagamento_final();

DO $$ DECLARE tem_rls boolean; BEGIN
  SELECT coalesce(relrowsecurity, false) INTO tem_rls FROM pg_class WHERE oid = to_regclass('"Loja"');
  REVOKE ALL ON "IntegracaoPagamentoSnapshot" FROM PUBLIC;
  IF tem_rls THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN RAISE EXCEPTION 'INT-1.8C: RLS exige erp_tenant existente.'; END IF;
    ALTER TABLE "IntegracaoPagamentoSnapshot" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "IntegracaoPagamentoSnapshot" FORCE ROW LEVEL SECURITY;
    CREATE POLICY "IPagSnapshot_do_parceiro" ON "IntegracaoPagamentoSnapshot" AS PERMISSIVE FOR ALL TO erp_tenant
      USING ("parceiroId" = NULLIF(current_setting('app.parceiro_id', true), '')) WITH CHECK ("parceiroId" = NULLIF(current_setting('app.parceiro_id', true), ''));
    GRANT SELECT, INSERT ON "IntegracaoPagamentoSnapshot" TO erp_tenant;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "IntegracaoPagamentoSnapshot" FROM erp_tenant; END IF;
END $$;
REVOKE ALL ON FUNCTION erp_integracao_pagamento_json_valido(json,int), erp_integracao_pagamento_normalizar(text), erp_integracao_pagamento_conferir_corpo(text,text,int,jsonb), erp_integracao_pagamento_snapshot_confere(), erp_integracao_pagamento_execucao_guard(), erp_integracao_pagamento_final() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    REVOKE ALL ON FUNCTION erp_integracao_pagamento_json_valido(json,int), erp_integracao_pagamento_normalizar(text), erp_integracao_pagamento_conferir_corpo(text,text,int,jsonb), erp_integracao_pagamento_snapshot_confere(), erp_integracao_pagamento_execucao_guard(), erp_integracao_pagamento_final() FROM erp_tenant;
  END IF;
END $$;
RESET search_path;
