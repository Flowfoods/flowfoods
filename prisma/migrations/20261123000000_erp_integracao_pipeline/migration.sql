-- CreateTable
CREATE TABLE "IntegracaoControle" (
    "id" TEXT NOT NULL,
    "pausada" BOOLEAN NOT NULL DEFAULT false,
    "donoAtual" TEXT,
    "proximaChamadaEm" TIMESTAMPTZ(3),
    "bloqueadaAte" TIMESTAMPTZ(3),
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IntegracaoControle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegracaoExecucao" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "perfil" TEXT NOT NULL DEFAULT 'diario',
    "tipo" TEXT NOT NULL,
    "ciclo" TEXT NOT NULL,
    "prioridade" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PLANEJADA',
    "fuso" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "unidade" TEXT NOT NULL DEFAULT 'REAL',
    "geracao" INTEGER NOT NULL DEFAULT 0,
    "dono" TEXT,
    "leaseAte" TIMESTAMPTZ(3),
    "naoAntesDe" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciadaEm" TIMESTAMPTZ(3),
    "concluidaEm" TIMESTAMPTZ(3),
    "ultimaPublicacaoEm" TIMESTAMPTZ(3),
    "ultimoHash" TEXT,
    "ultimoErro" TEXT,
    "ultimoHttp" INTEGER,
    "ultimoRequestId" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IntegracaoExecucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegracaoPayload" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "geracao" INTEGER NOT NULL,
    "pagina" INTEGER NOT NULL,
    "corpoOriginal" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "resposta" JSONB NOT NULL,
    "http" INTEGER NOT NULL,
    "requestId" TEXT,
    "recebidoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegracaoPayload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegracaoSnapshot" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "geracao" INTEGER NOT NULL,
    "situacao" TEXT NOT NULL,
    "vazioOficial" BOOLEAN NOT NULL,
    "hash" TEXT NOT NULL,
    "pedidos" BIGINT NOT NULL,
    "numeroGrupos" INTEGER NOT NULL,
    "transacaoCriacao" BIGINT NOT NULL DEFAULT txid_current(),
    "origem" TEXT NOT NULL DEFAULT 'IFOOD_ANALYTICS_V1',
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegracaoSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiIfoodDia" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "chaveGrupo" TEXT NOT NULL,
    "orderStatus" TEXT,
    "salesChannel" TEXT,
    "deliveredBy" TEXT,
    "category" TEXT,
    "pedidos" BIGINT NOT NULL,
    "gmv" BIGINT,
    "gmvWithoutDelivery" BIGINT,
    "netDeliveryFee" BIGINT,
    "paymentTotalValue" BIGINT,
    "benefitByTypePartnerTotalValue" BIGINT,
    "refundedTotalValue" BIGINT,

    CONSTRAINT "KpiIfoodDia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegracaoExecucao_parceiroId_estado_naoAntesDe_prioridade_idx" ON "IntegracaoExecucao"("parceiroId", "estado", "naoAntesDe", "prioridade");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoExecucao_parceiroId_id_key" ON "IntegracaoExecucao"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoExecucao_parceiroId_moduloId_dia_perfil_key" ON "IntegracaoExecucao"("parceiroId", "moduloId", "dia", "perfil");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoPayload_parceiroId_id_key" ON "IntegracaoPayload"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoPayload_parceiroId_execucaoId_geracao_pagina_key" ON "IntegracaoPayload"("parceiroId", "execucaoId", "geracao", "pagina");

-- CreateIndex
CREATE INDEX "IntegracaoSnapshot_parceiroId_execucaoId_situacao_geracao_idx" ON "IntegracaoSnapshot"("parceiroId", "execucaoId", "situacao", "geracao");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoSnapshot_parceiroId_id_key" ON "IntegracaoSnapshot"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoSnapshot_parceiroId_execucaoId_geracao_key" ON "IntegracaoSnapshot"("parceiroId", "execucaoId", "geracao");

-- CreateIndex
CREATE UNIQUE INDEX "KpiIfoodDia_parceiroId_id_key" ON "KpiIfoodDia"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "KpiIfoodDia_parceiroId_snapshotId_chaveGrupo_key" ON "KpiIfoodDia"("parceiroId", "snapshotId", "chaveGrupo");

-- AddForeignKey
ALTER TABLE "IntegracaoExecucao" ADD CONSTRAINT "IntegracaoExecucao_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoExecucao" ADD CONSTRAINT "IntegracaoExecucao_parceiroId_moduloId_fkey" FOREIGN KEY ("parceiroId", "moduloId") REFERENCES "IntegracaoConexaoModulo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoPayload" ADD CONSTRAINT "IntegracaoPayload_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoPayload" ADD CONSTRAINT "IntegracaoPayload_parceiroId_execucaoId_fkey" FOREIGN KEY ("parceiroId", "execucaoId") REFERENCES "IntegracaoExecucao"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoSnapshot" ADD CONSTRAINT "IntegracaoSnapshot_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoSnapshot" ADD CONSTRAINT "IntegracaoSnapshot_parceiroId_execucaoId_fkey" FOREIGN KEY ("parceiroId", "execucaoId") REFERENCES "IntegracaoExecucao"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiIfoodDia" ADD CONSTRAINT "KpiIfoodDia_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiIfoodDia" ADD CONSTRAINT "KpiIfoodDia_parceiroId_snapshotId_fkey" FOREIGN KEY ("parceiroId", "snapshotId") REFERENCES "IntegracaoSnapshot"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- INT-1.6: somente persistência. O seed não habilita integração, módulo ou parceiro.
ALTER TABLE "IntegracaoControle"
  ADD CONSTRAINT "IntegracaoControle_identidade" CHECK ("id" = 'IFOOD_ANALYTICS'),
  ADD CONSTRAINT "IntegracaoControle_dono_uuid" CHECK ("donoAtual" IS NULL OR "donoAtual" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  ADD CONSTRAINT "IntegracaoControle_prazo_finito" CHECK ("bloqueadaAte" IS NULL OR isfinite("bloqueadaAte"));
INSERT INTO "IntegracaoControle" ("id", "pausada", "atualizadoEm") VALUES ('IFOOD_ANALYTICS', false, CURRENT_TIMESTAMP);

ALTER TABLE "IntegracaoExecucao"
  ADD CONSTRAINT "IntegracaoExecucao_estado" CHECK ("estado" IN ('PLANEJADA','EXECUTANDO','SUCESSO','FALHA','AGUARDANDO','PENDENTE_PERIODO')),
  ADD CONSTRAINT "IntegracaoExecucao_perfil_tipo" CHECK (
    ("perfil" = 'diario' AND "tipo" IN ('D1','REVISAO','HISTORICO')) OR ("perfil" = 'acesso' AND "tipo" = 'ACESSO')
  ),
  ADD CONSTRAINT "IntegracaoExecucao_lease" CHECK (
    ("estado" = 'EXECUTANDO' AND "dono" IS NOT NULL AND "leaseAte" IS NOT NULL AND isfinite("leaseAte")) OR
    ("estado" <> 'EXECUTANDO' AND "dono" IS NULL AND "leaseAte" IS NULL)
  ),
  ADD CONSTRAINT "IntegracaoExecucao_faixas" CHECK (
    "geracao" >= 0 AND "prioridade" BETWEEN 0 AND 3 AND isfinite("dia") AND isfinite("naoAntesDe")
    AND "unidade" IN ('REAL','CENTAVO') AND char_length("fuso") BETWEEN 1 AND 80
    AND char_length("ciclo") BETWEEN 1 AND 40
    AND ("dono" IS NULL OR "dono" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    AND ("ultimoHash" IS NULL OR "ultimoHash" ~ '^[0-9a-f]{64}$')
    AND ("ultimoHttp" IS NULL OR "ultimoHttp" BETWEEN 100 AND 599)
  );
ALTER TABLE "IntegracaoPayload"
  ADD CONSTRAINT "IntegracaoPayload_corpo" CHECK (octet_length("corpoOriginal") BETWEEN 1 AND 2097152 AND "resposta" = "corpoOriginal"::jsonb),
  ADD CONSTRAINT "IntegracaoPayload_identidade" CHECK ("geracao" > 0 AND "pagina" BETWEEN 1 AND 1000 AND "http" = 200 AND "sha256" ~ '^[0-9a-f]{64}$');
-- O hash dos bytes originais é calculado obrigatoriamente no repositório Node.
-- Não instalar/pressupor pgcrypto nem afirmar que comparar JSONB recompõe esses bytes.
ALTER TABLE "IntegracaoSnapshot"
  ADD CONSTRAINT "IntegracaoSnapshot_estado" CHECK ("situacao" IN ('PUBLICADO','PENDENTE_PERIODO') AND "origem" = 'IFOOD_ANALYTICS_V1'),
  ADD CONSTRAINT "IntegracaoSnapshot_totais" CHECK ("geracao" > 0 AND "numeroGrupos" BETWEEN 0 AND 50000 AND "pedidos" BETWEEN 0 AND 9007199254740991 AND "vazioOficial" = ("numeroGrupos" = 0) AND "hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "KpiIfoodDia"
  ADD CONSTRAINT "KpiIfoodDia_grupo" CHECK ("chaveGrupo" ~ '^[0-9a-f]{64}$' AND "pedidos" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "KpiIfoodDia_valores" CHECK (
    ("gmv" IS NULL OR "gmv" BETWEEN -9007199254740991 AND 9007199254740991)
    AND ("gmvWithoutDelivery" IS NULL OR "gmvWithoutDelivery" BETWEEN -9007199254740991 AND 9007199254740991)
    AND ("netDeliveryFee" IS NULL OR "netDeliveryFee" BETWEEN -9007199254740991 AND 9007199254740991)
    AND ("paymentTotalValue" IS NULL OR "paymentTotalValue" BETWEEN -9007199254740991 AND 9007199254740991)
    AND ("benefitByTypePartnerTotalValue" IS NULL OR "benefitByTypePartnerTotalValue" BETWEEN -9007199254740991 AND 9007199254740991)
    AND ("refundedTotalValue" IS NULL OR "refundedTotalValue" BETWEEN -9007199254740991 AND 9007199254740991)
  );
-- Prisma não exprime NULLS NOT DISTINCT: índice manual do grão, além do hash da tupla.
CREATE UNIQUE INDEX "KpiIfoodDia_grao_semantico_key" ON "KpiIfoodDia" ("parceiroId","snapshotId","orderStatus","salesChannel","deliveredBy","category") NULLS NOT DISTINCT;

-- Mesmo schema fixado na criação, pg_temp SEMPRE depois. O schema pode ser isolado
-- pelos testes; nenhum identificador é escolhido por parâmetro da função.
DO $$ BEGIN EXECUTE format('SET search_path = %I, pg_temp', current_schema()); END $$;

-- Prova pontual da sessão de posse, independente do estado persistido do job.
-- O worker detém advisory lock de SESSÃO (dois int4: ASCII FFAN, 1).
CREATE FUNCTION erp_integracao_posse_viva(p_dono text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path FROM CURRENT AS $$
  SELECT p_dono IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_stat_activity a JOIN pg_catalog.pg_locks l ON l.pid = a.pid AND l.database = a.datid
    WHERE a.datid = (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
      AND a.application_name = 'flowfoods-analytics:' || p_dono
      AND l.locktype = 'advisory' AND l.classid = 1179009358::oid AND l.objid = 1::oid
      AND l.objsubid = 2 AND l.mode = 'ExclusiveLock' AND l.granted
  );
$$;

CREATE FUNCTION erp_integracao_exigir_acesso(p_parceiro text, p_modulo text, p_dono text DEFAULT NULL, p_verificacao boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE
  controle "IntegracaoControle"%ROWTYPE;
  parceiro "ParceiroFlow"%ROWTYPE;
  conexao "IntegracaoConexao"%ROWTYPE;
  modulo "IntegracaoConexaoModulo"%ROWTYPE;
  app "IntegracaoApp"%ROWTYPE;
  liberacao "LiberacaoDeModulo"%ROWTYPE;
  conexao_id text;
BEGIN
  IF p_parceiro IS NULL OR p_parceiro IS DISTINCT FROM NULLIF(current_setting('app.parceiro_id', true), '') THEN RETURN false; END IF;
  -- Ordem: controle, parceiro, conexão, módulo, liberação, app; depois execução.
  -- Módulo usa UPDATE desde o início: 403 precisa alterá-lo sem upgrade de SHARE
  -- depois de travar a execução. As transações são curtas; HTTP ocorre fora delas.
  SELECT c.* INTO controle FROM "IntegracaoControle" c WHERE c."id" = 'IFOOD_ANALYTICS' FOR SHARE;
  IF NOT FOUND OR controle."pausada" OR controle."bloqueadaAte" > clock_timestamp()
    OR (p_dono IS NOT NULL AND (controle."donoAtual" IS DISTINCT FROM p_dono OR NOT erp_integracao_posse_viva(p_dono))) THEN RETURN false; END IF;
  SELECT p.* INTO parceiro FROM "ParceiroFlow" p WHERE p."id" = p_parceiro FOR SHARE;
  IF NOT FOUND OR parceiro."status" <> 'ATIVO' THEN RETURN false; END IF;
  -- Identidade do módulo é imutável. A leitura inicial serve só para ordenar as travas.
  SELECT m."conexaoId" INTO conexao_id FROM "IntegracaoConexaoModulo" m WHERE m."parceiroId" = p_parceiro AND m."id" = p_modulo;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT c.* INTO conexao FROM "IntegracaoConexao" c WHERE c."parceiroId" = p_parceiro AND c."id" = conexao_id FOR SHARE;
  IF NOT FOUND OR conexao."estado" <> 'ATIVA' OR conexao."provedor" <> 'IFOOD' THEN RETURN false; END IF;
  SELECT m.* INTO modulo FROM "IntegracaoConexaoModulo" m WHERE m."parceiroId" = p_parceiro AND m."id" = p_modulo FOR UPDATE;
  IF NOT FOUND OR modulo."conexaoId" IS DISTINCT FROM conexao_id OR modulo."modulo" <> 'ANALYTICS'
    OR NOT (modulo."estado" = 'ATIVO' OR (p_verificacao IS TRUE AND modulo."estado" = 'AUTORIZADO')) THEN RETURN false; END IF;
  SELECT l.* INTO liberacao FROM "LiberacaoDeModulo" l WHERE l."parceiroId" = p_parceiro AND l."modulo" = 'integracao' FOR SHARE;
  IF NOT FOUND OR NOT liberacao."liberado" THEN RETURN false; END IF;
  SELECT a.* INTO app FROM "IntegracaoApp" a WHERE a."id" = modulo."appId" FOR SHARE;
  IF NOT FOUND OR app."provedor" <> conexao."provedor" OR app."ambiente" <> conexao."ambiente" OR NOT coalesce('ANALYTICS' = ANY(app."modulos"), false) THEN RETURN false; END IF;
  IF (conexao."ambiente" = 'TEST') IS DISTINCT FROM parceiro."homologacaoDeIntegracao" THEN RETURN false; END IF;
  IF conexao."ambiente" = 'PRODUCAO' AND app."estadoHomologacao" <> 'HOMOLOGADO' THEN RETURN false; END IF;
  RETURN true;
END $$;

-- Não confere liberação/módulo/pausa: a mesma posse precisa registrar uma recusa 403.
-- A execução tem de continuar sua, na mesma geração, e o relógio é o real, não o início da TX.
CREATE FUNCTION erp_integracao_fence(p_parceiro text, p_execucao text, p_geracao int, p_dono text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE controle "IntegracaoControle"%ROWTYPE; execucao "IntegracaoExecucao"%ROWTYPE; modulo_id text; conexao_id text;
BEGIN
  IF p_parceiro IS NULL OR p_dono IS NULL OR p_geracao IS NULL OR p_geracao <= 0 OR p_parceiro IS DISTINCT FROM NULLIF(current_setting('app.parceiro_id', true), '') THEN RETURN false; END IF;
  SELECT c.* INTO controle FROM "IntegracaoControle" c WHERE c."id" = 'IFOOD_ANALYTICS' FOR SHARE;
  IF NOT FOUND OR controle."donoAtual" IS DISTINCT FROM p_dono OR NOT erp_integracao_posse_viva(p_dono) THEN RETURN false; END IF;
  -- Mesma ordem das travas de acesso, sem exigir liberação/módulo ativos: uma
  -- revogação precisa continuar registrável. FOR UPDATE serializa páginas e publicações
  -- concorrentes da mesma geração, sem upgrade SHARE -> UPDATE entre elas.
  PERFORM 1 FROM "ParceiroFlow" p WHERE p."id" = p_parceiro AND p."status" = 'ATIVO' FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT e."moduloId", m."conexaoId" INTO modulo_id, conexao_id
    FROM "IntegracaoExecucao" e JOIN "IntegracaoConexaoModulo" m ON m."parceiroId" = e."parceiroId" AND m."id" = e."moduloId"
    WHERE e."parceiroId" = p_parceiro AND e."id" = p_execucao;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM "IntegracaoConexao" c WHERE c."parceiroId" = p_parceiro AND c."id" = conexao_id FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM "IntegracaoConexaoModulo" m WHERE m."parceiroId" = p_parceiro AND m."id" = modulo_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT e.* INTO execucao FROM "IntegracaoExecucao" e WHERE e."parceiroId" = p_parceiro AND e."id" = p_execucao FOR UPDATE;
  RETURN coalesce(FOUND AND execucao."estado" = 'EXECUTANDO' AND execucao."dono" = p_dono
    AND execucao."geracao" = p_geracao AND execucao."leaseAte" > clock_timestamp(), false);
END $$;

-- Um 429 impede também outra janela de antecipar a retomada. Não é contador de
-- quota: é um prazo global conservador, monotônico. O caller chama ANTES de fence
-- ou acesso na TX para nunca converter um SHARE do controle em UPDATE.
CREATE FUNCTION erp_integracao_adiar(p_parceiro text, p_execucao text, p_geracao int, p_dono text, p_prazo timestamptz, p_pausar boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE controle "IntegracaoControle"%ROWTYPE; prazo timestamptz; pausa boolean;
BEGIN
  IF p_parceiro IS NULL OR p_parceiro IS DISTINCT FROM NULLIF(current_setting('app.parceiro_id', true), '')
    OR p_pausar IS NULL OR (p_prazo IS NULL AND NOT p_pausar) OR (p_prazo IS NOT NULL AND NOT isfinite(p_prazo)) THEN RETURN false; END IF;
  SELECT c.* INTO controle FROM "IntegracaoControle" c WHERE c."id" = 'IFOOD_ANALYTICS' FOR UPDATE;
  IF NOT FOUND OR NOT erp_integracao_fence(p_parceiro, p_execucao, p_geracao, p_dono) THEN RETURN false; END IF;
  prazo := CASE WHEN p_prazo IS NULL THEN controle."bloqueadaAte" ELSE GREATEST(controle."bloqueadaAte", p_prazo) END;
  pausa := controle."pausada" OR p_pausar;
  IF controle."bloqueadaAte" IS DISTINCT FROM prazo OR controle."pausada" IS DISTINCT FROM pausa THEN
    UPDATE "IntegracaoControle" c SET "bloqueadaAte" = prazo, "pausada" = pausa, "atualizadoEm" = clock_timestamp() WHERE c."id" = 'IFOOD_ANALYTICS';
    INSERT INTO "AuditLog" ("id", "evento", "dados") VALUES (
      md5(clock_timestamp()::text || random()::text || p_dono), 'integracao.analytics-retomada',
      jsonb_build_object('pausada', pausa, 'retomadaMinimaEm', prazo, 'origem', '429')
    );
  END IF;
  RETURN true;
END $$;

CREATE FUNCTION erp_integracao_execucao_imutavel() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF ROW(NEW."id",NEW."parceiroId",NEW."moduloId",NEW."dia",NEW."perfil",NEW."fuso",NEW."unidade")
    IS DISTINCT FROM ROW(OLD."id",OLD."parceiroId",OLD."moduloId",OLD."dia",OLD."perfil",OLD."fuso",OLD."unidade") THEN
    RAISE EXCEPTION 'A identidade da janela de integração não pode mudar.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION erp_integracao_so_inclusao() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN RAISE EXCEPTION 'A evidência de integração é imutável.' USING ERRCODE = 'check_violation'; END $$;

CREATE FUNCTION erp_integracao_payload_confere() RETURNS trigger
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
  RETURN NEW;
END $$;

CREATE FUNCTION erp_integracao_snapshot_confere() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE execucao "IntegracaoExecucao"%ROWTYPE;
BEGIN
  SELECT e.* INTO execucao FROM "IntegracaoExecucao" e WHERE e."parceiroId" = NEW."parceiroId" AND e."id" = NEW."execucaoId";
  IF NOT FOUND OR execucao."perfil" <> 'diario' THEN
    RAISE EXCEPTION 'Somente uma janela diária pode publicar Analytics.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT erp_integracao_exigir_acesso(NEW."parceiroId", execucao."moduloId", execucao."dono", false) THEN
    RAISE EXCEPTION 'A publicação da integração não está autorizada nesta execução.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT erp_integracao_fence(NEW."parceiroId", NEW."execucaoId", NEW."geracao", execucao."dono") THEN
    RAISE EXCEPTION 'A publicação da integração não está autorizada nesta execução.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('erp-faturamento:' || NEW."parceiroId", 0));
  IF NEW."situacao" <> 'PENDENTE_PERIODO' AND EXISTS (
    SELECT 1 FROM "PeriodoApuracao" p WHERE p."parceiroId" = NEW."parceiroId" AND p."status" = 'FECHADO' AND execucao."dia" BETWEEN p."inicio" AND p."fim"
  ) THEN
    RAISE EXCEPTION 'O período está fechado: a integração deve aguardar revisão.' USING ERRCODE = 'check_violation';
  END IF;
  NEW."transacaoCriacao" := txid_current();
  RETURN NEW;
END $$;

CREATE FUNCTION erp_integracao_kpi_confere() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE transacao bigint;
BEGIN
  IF NEW."parceiroId" IS DISTINCT FROM NULLIF(current_setting('app.parceiro_id', true), '') THEN
    RAISE EXCEPTION 'O parceiro da integração não corresponde ao contexto.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT s."transacaoCriacao" INTO transacao FROM "IntegracaoSnapshot" s WHERE s."parceiroId" = NEW."parceiroId" AND s."id" = NEW."snapshotId";
  IF NOT FOUND OR transacao <> txid_current() THEN
    RAISE EXCEPTION 'Os grupos devem nascer na mesma transação da fotografia.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION erp_integracao_snapshot_totais() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE grupos bigint; total numeric; dono text;
BEGIN
  -- O cabeçalho reteve SHARE no controle: donoAtual não pode ser substituído
  -- nesta TX. A sessão pode, porém, morrer durante a inclusão dos lotes.
  -- Confere novamente no COMMIT; o job já pode estar SUCESSO, sem lease/dono.
  SELECT c."donoAtual" INTO dono FROM "IntegracaoControle" c WHERE c."id" = 'IFOOD_ANALYTICS' FOR SHARE;
  IF NOT FOUND OR NOT erp_integracao_posse_viva(dono) THEN
    RAISE EXCEPTION 'A publicação perdeu a posse antes de terminar.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*), coalesce(sum(k."pedidos"), 0) INTO grupos, total FROM "KpiIfoodDia" k WHERE k."parceiroId" = NEW."parceiroId" AND k."snapshotId" = NEW."id";
  IF grupos <> NEW."numeroGrupos" OR total <> NEW."pedidos" OR NEW."vazioOficial" IS DISTINCT FROM (grupos = 0) THEN
    RAISE EXCEPTION 'A fotografia da integração não contém todos os seus grupos e pedidos.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER "IntegracaoExecucao_identidade_imutavel" BEFORE UPDATE ON "IntegracaoExecucao" FOR EACH ROW EXECUTE FUNCTION erp_integracao_execucao_imutavel();
CREATE TRIGGER "IntegracaoPayload_confere" BEFORE INSERT ON "IntegracaoPayload" FOR EACH ROW EXECUTE FUNCTION erp_integracao_payload_confere();
CREATE TRIGGER "IntegracaoSnapshot_confere" BEFORE INSERT ON "IntegracaoSnapshot" FOR EACH ROW EXECUTE FUNCTION erp_integracao_snapshot_confere();
CREATE TRIGGER "KpiIfoodDia_confere" BEFORE INSERT ON "KpiIfoodDia" FOR EACH ROW EXECUTE FUNCTION erp_integracao_kpi_confere();
CREATE CONSTRAINT TRIGGER "IntegracaoSnapshot_completude" AFTER INSERT ON "IntegracaoSnapshot" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_integracao_snapshot_totais();
DO $$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['IntegracaoExecucao','IntegracaoPayload','IntegracaoSnapshot','KpiIfoodDia'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION erp_parceiro_imutavel()', tabela || '_parceiro_imutavel', tabela);
  END LOOP;
  FOREACH tabela IN ARRAY ARRAY['IntegracaoPayload','IntegracaoSnapshot','KpiIfoodDia'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION erp_integracao_so_inclusao()', tabela || '_imutavel', tabela);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION erp_integracao_so_inclusao()', tabela || '_sem_truncate', tabela);
  END LOOP;
END $$;

-- RLS acompanha Loja. Não há escrita de tenant durante instalação; o dono sob
-- FORCE RLS pode não enxergar nenhuma linha sem o contexto, por isso só catálogo.
DO $$
DECLARE tabela text; tem_rls boolean;
BEGIN
  SELECT coalesce(relrowsecurity, false) INTO tem_rls FROM pg_class WHERE oid = to_regclass('"Loja"');
  IF tem_rls THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN RAISE EXCEPTION 'INT-1.6: RLS exige o papel erp_tenant existente.'; END IF;
    FOREACH tabela IN ARRAY ARRAY['IntegracaoExecucao','IntegracaoPayload','IntegracaoSnapshot','KpiIfoodDia'] LOOP
      EXECUTE format('GRANT SELECT, INSERT ON %I TO erp_tenant', tabela);
      IF tabela = 'IntegracaoExecucao' THEN EXECUTE format('GRANT UPDATE ON %I TO erp_tenant', tabela); END IF;
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tabela);
      EXECUTE format('CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL TO erp_tenant USING ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), '''')) WITH CHECK ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), ''''))', tabela || '_do_parceiro', tabela);
    END LOOP;
  END IF;
  REVOKE ALL ON "IntegracaoControle" FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    REVOKE ALL ON "IntegracaoControle" FROM erp_tenant;
    REVOKE DELETE, TRUNCATE ON "IntegracaoExecucao", "IntegracaoPayload", "IntegracaoSnapshot", "KpiIfoodDia" FROM erp_tenant;
    REVOKE UPDATE ON "IntegracaoPayload", "IntegracaoSnapshot", "KpiIfoodDia" FROM erp_tenant;
  END IF;
END $$;
REVOKE ALL ON FUNCTION erp_integracao_posse_viva(text), erp_integracao_exigir_acesso(text,text,text,boolean), erp_integracao_fence(text,text,int,text), erp_integracao_adiar(text,text,int,text,timestamptz,boolean), erp_integracao_execucao_imutavel(), erp_integracao_so_inclusao(), erp_integracao_payload_confere(), erp_integracao_snapshot_confere(), erp_integracao_kpi_confere(), erp_integracao_snapshot_totais() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    GRANT EXECUTE ON FUNCTION erp_integracao_exigir_acesso(text,text,text,boolean), erp_integracao_fence(text,text,int,text), erp_integracao_adiar(text,text,int,text,timestamptz,boolean) TO erp_tenant;
  END IF;
END $$;
RESET search_path;
