-- INT-1.7B. Recibo e fontes da aplicação financeira, sem nova fila/lease.
-- Nenhum faturamento antigo é convertido ou preenchido nesta migration.
CREATE TABLE "IntegracaoFaturamentoDia" (
  "id" TEXT NOT NULL, "parceiroId" TEXT NOT NULL, "lojaId" TEXT NOT NULL, "dia" DATE NOT NULL,
  "canal" "CanalVenda" NOT NULL DEFAULT 'IFOOD', "fonte" TEXT NOT NULL DEFAULT 'ifood-analytics',
  "estado" TEXT NOT NULL DEFAULT 'PENDENTE', "motivo" TEXT,
  "revisaoSolicitada" BIGINT NOT NULL DEFAULT 1, "revisaoConferida" BIGINT NOT NULL DEFAULT 0,
  "solicitadaEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "conferidaEm" TIMESTAMPTZ(3),
  "hashAplicado" TEXT, "versaoMapaAplicada" INTEGER, "aplicadoEm" TIMESTAMPTZ(3),
  "transacaoAplicacao" BIGINT, "donoAplicacao" TEXT,
  "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "IntegracaoFaturamentoDia_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IFFDia_identidade" CHECK ("canal"='IFOOD' AND "fonte"='ifood-analytics' AND "dia">=DATE '2020-01-01'),
  CONSTRAINT "IFFDia_estado" CHECK ("estado" IN ('PENDENTE','APLICADO','PENDENTE_DADOS','PENDENTE_PERIODO','PENDENTE_ACESSO','PENDENTE_VINCULO')
    AND ("estado"<>'APLICADO' OR ("motivo" IS NULL AND "hashAplicado" IS NOT NULL))),
  CONSTRAINT "IFFDia_motivo" CHECK ("motivo" IS NULL OR "motivo" IN ('PERIODO_FECHADO','COBERTURA_INCOMPLETA','ACESSO','VINCULO_AMBIGUO','MARCA_DIVERGENTE','OUTRA_INTEGRACAO','DESTINO_DIVERGENTE','IDENTIDADE','SNAPSHOT_NAO_PUBLICADO','SNAPSHOT_INCOMPLETO','RECORTE_NAO_MAPEADO','VALOR_AUSENTE','NUMEROS_INVALIDOS','LIMITE_FATURAMENTO')),
  CONSTRAINT "IFFDia_revisoes" CHECK ("revisaoConferida">=0 AND "revisaoSolicitada">="revisaoConferida"),
  CONSTRAINT "IFFDia_aplicacao" CHECK (("hashAplicado" IS NULL AND "versaoMapaAplicada" IS NULL AND "aplicadoEm" IS NULL)
    OR ("hashAplicado" IS NOT NULL AND "hashAplicado" ~ '^[0-9a-f]{64}$' AND "versaoMapaAplicada" IS NOT NULL AND "versaoMapaAplicada">0 AND "aplicadoEm" IS NOT NULL)),
  CONSTRAINT "IFFDia_preparacao" CHECK (("transacaoAplicacao" IS NULL AND "donoAplicacao" IS NULL)
    OR ("transacaoAplicacao" IS NOT NULL AND "transacaoAplicacao">0 AND "donoAplicacao" IS NOT NULL AND "donoAplicacao" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
);
CREATE TABLE "IntegracaoFaturamentoFonte" (
  "id" TEXT NOT NULL, "parceiroId" TEXT NOT NULL, "reciboId" TEXT NOT NULL, "dia" DATE NOT NULL,
  "merchantId" TEXT NOT NULL, "conexaoId" TEXT NOT NULL, "moduloId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL, "lancamentoId" TEXT NOT NULL, "marcaAplicadaId" TEXT,
  "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "IntegracaoFaturamentoFonte_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IFFFonte_merchant" CHECK ("merchantId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
CREATE UNIQUE INDEX "IFFDia_tenant_key" ON "IntegracaoFaturamentoDia"("parceiroId","id");
CREATE UNIQUE INDEX "IFFDia_tenant_dia_key" ON "IntegracaoFaturamentoDia"("parceiroId","id","dia");
CREATE UNIQUE INDEX "IFFDia_grao_key" ON "IntegracaoFaturamentoDia"("parceiroId","lojaId","canal","dia","fonte");
CREATE INDEX "IFFDia_pendentes_idx" ON "IntegracaoFaturamentoDia"("parceiroId","estado","conferidaEm","id");
CREATE UNIQUE INDEX "IFFFonte_tenant_key" ON "IntegracaoFaturamentoFonte"("parceiroId","id");
CREATE UNIQUE INDEX "IFFFonte_recibo_merchant_key" ON "IntegracaoFaturamentoFonte"("parceiroId","reciboId","merchantId");
CREATE UNIQUE INDEX "IFFFonte_merchant_dia_key" ON "IntegracaoFaturamentoFonte"("parceiroId","merchantId","dia");
CREATE UNIQUE INDEX "IFFFonte_lancamento_key" ON "IntegracaoFaturamentoFonte"("parceiroId","lancamentoId");
ALTER TABLE "IntegracaoFaturamentoDia" ADD CONSTRAINT "IntegracaoFaturamentoDia_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegracaoFaturamentoDia" ADD CONSTRAINT "IFFDia_loja_fkey" FOREIGN KEY ("parceiroId","lojaId") REFERENCES "Loja"("parceiroId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegracaoFaturamentoFonte" ADD CONSTRAINT "IntegracaoFaturamentoFonte_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegracaoFaturamentoFonte" ADD CONSTRAINT "IFFFonte_recibo_fkey" FOREIGN KEY ("parceiroId","reciboId","dia") REFERENCES "IntegracaoFaturamentoDia"("parceiroId","id","dia") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegracaoFaturamentoFonte" ADD CONSTRAINT "IFFFonte_conexao_fkey" FOREIGN KEY ("parceiroId","conexaoId") REFERENCES "IntegracaoConexao"("parceiroId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegracaoFaturamentoFonte" ADD CONSTRAINT "IFFFonte_modulo_fkey" FOREIGN KEY ("parceiroId","moduloId") REFERENCES "IntegracaoConexaoModulo"("parceiroId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegracaoFaturamentoFonte" ADD CONSTRAINT "IFFFonte_snapshot_fkey" FOREIGN KEY ("parceiroId","snapshotId") REFERENCES "IntegracaoSnapshot"("parceiroId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegracaoFaturamentoFonte" ADD CONSTRAINT "IFFFonte_lancamento_fkey" FOREIGN KEY ("parceiroId","lancamentoId") REFERENCES "FaturamentoLancamento"("parceiroId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegracaoFaturamentoFonte" ADD CONSTRAINT "IFFFonte_marca_fkey" FOREIGN KEY ("parceiroId","marcaAplicadaId") REFERENCES "Marca"("parceiroId","id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$ BEGIN EXECUTE format('SET search_path = %I, pg_temp', current_schema()); END $$;

CREATE FUNCTION erp_integracao_travar_cobertura(p_parceiro text,p_loja text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
BEGIN
  IF p_parceiro IS NULL OR p_loja IS NULL OR p_parceiro IS DISTINCT FROM NULLIF(current_setting('app.parceiro_id',true),'') THEN
    RAISE EXCEPTION 'Contexto de cobertura inválido.' USING ERRCODE='check_violation';
  END IF;
  -- Conservadora por parceiro: também cobre o mesmo merchant religado em
  -- outra loja, sem precisar adquirir um segundo lock depois do roster.
  PERFORM pg_advisory_xact_lock(hashtextextended('erp-integracao-faturamento:'||p_parceiro,0));
END $$;

-- INSERT de conexão cobre o phantom; UPDATE/403 não adquire cobertura tarde.
CREATE FUNCTION erp_integracao_conexao_cobertura() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
BEGIN
  IF NEW."provedor"='IFOOD' AND NEW."ambiente"='PRODUCAO' THEN
    IF TG_WHEN='BEFORE' THEN PERFORM erp_integracao_travar_cobertura(NEW."parceiroId",NEW."lojaId");
    ELSE
      UPDATE "IntegracaoFaturamentoDia" h SET "revisaoSolicitada"=h."revisaoSolicitada"+1,
        "solicitadaEm"=clock_timestamp(),"atualizadoEm"=clock_timestamp(),"estado"='PENDENTE',"motivo"=NULL
        WHERE h."parceiroId"=NEW."parceiroId" AND (h."lojaId"=NEW."lojaId" OR EXISTS(
          SELECT 1 FROM "IntegracaoFaturamentoFonte" f WHERE f."parceiroId"=h."parceiroId" AND f."reciboId"=h."id" AND f."merchantId"=NEW."idExterno"));
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION erp_integracao_faturamento_pendencia(p_parceiro text,p_recibo text,p_dono text,p_motivo text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
BEGIN
  IF NOT erp_integracao_faturamento_posse(p_parceiro,p_dono) THEN RETURN false; END IF;
  IF p_motivo IS NULL OR NOT p_motivo=ANY(ARRAY['PERIODO_FECHADO','COBERTURA_INCOMPLETA','ACESSO','VINCULO_AMBIGUO','MARCA_DIVERGENTE','OUTRA_INTEGRACAO','DESTINO_DIVERGENTE','IDENTIDADE','SNAPSHOT_NAO_PUBLICADO','SNAPSHOT_INCOMPLETO','RECORTE_NAO_MAPEADO','VALOR_AUSENTE','NUMEROS_INVALIDOS','LIMITE_FATURAMENTO']) THEN RETURN false; END IF;
  UPDATE "IntegracaoFaturamentoDia" h SET "estado"=CASE p_motivo WHEN 'PERIODO_FECHADO' THEN 'PENDENTE_PERIODO' WHEN 'ACESSO' THEN 'PENDENTE_ACESSO' WHEN 'VINCULO_AMBIGUO' THEN 'PENDENTE_VINCULO' WHEN 'MARCA_DIVERGENTE' THEN 'PENDENTE_VINCULO' ELSE 'PENDENTE_DADOS' END,
    "motivo"=p_motivo,"revisaoConferida"=h."revisaoSolicitada","conferidaEm"=clock_timestamp(),"atualizadoEm"=clock_timestamp(),
    "transacaoAplicacao"=CASE WHEN h."transacaoAplicacao"=txid_current() THEN NULL ELSE h."transacaoAplicacao" END,
    "donoAplicacao"=CASE WHEN h."transacaoAplicacao"=txid_current() THEN NULL ELSE h."donoAplicacao" END
    WHERE h."parceiroId"=p_parceiro AND h."id"=p_recibo;
  RETURN FOUND;
END $$;

-- Privada. Não adquire cobertura/módulos depois da row lock: o helper preparar
-- já reteve essas travas. Relê a imagem FINAL, inclusive no COMMIT diferido.
CREATE FUNCTION erp_integracao_faturamento_validar(p_parceiro text,p_recibo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE r "IntegracaoFaturamentoDia"%ROWTYPE; f record; n bigint; total_valor numeric; total_pedidos numeric; valor numeric; pedidos numeric;
BEGIN
  SELECT h.* INTO r FROM "IntegracaoFaturamentoDia" h WHERE h."parceiroId"=p_parceiro AND h."id"=p_recibo;
  IF NOT FOUND OR r."transacaoAplicacao" IS DISTINCT FROM txid_current() OR r."estado"<>'APLICADO'
    OR NOT erp_integracao_faturamento_posse(p_parceiro,r."donoAplicacao") THEN
    RAISE EXCEPTION 'A aplicação financeira não foi concluída nesta transação com posse viva.' USING ERRCODE='check_violation';
  END IF;
  IF EXISTS(SELECT 1 FROM "IntegracaoControle" ctl WHERE ctl."id"='IFOOD_ANALYTICS' AND (ctl."pausada" OR ctl."bloqueadaAte">clock_timestamp()))
    OR NOT EXISTS(SELECT 1 FROM "Loja" l WHERE l."parceiroId"=p_parceiro AND l."id"=r."lojaId" AND l."ativa" AND 'IFOOD'=ANY(l."canaisDeVenda"))
    OR EXISTS(SELECT 1 FROM "PeriodoApuracao" p WHERE p."parceiroId"=p_parceiro AND p."status"='FECHADO' AND r."dia" BETWEEN p."inicio" AND p."fim") THEN
    RAISE EXCEPTION 'A aplicação financeira perdeu acesso ou encontrou período fechado.' USING ERRCODE='check_violation';
  END IF;
  SELECT count(*) INTO n FROM "IntegracaoFaturamentoFonte" sf WHERE sf."parceiroId"=p_parceiro AND sf."reciboId"=p_recibo;
  IF n=0 OR EXISTS(SELECT 1 FROM "IntegracaoConexao" c WHERE c."parceiroId"=p_parceiro AND c."lojaId"=r."lojaId" AND c."provedor"='IFOOD' AND c."ambiente"='PRODUCAO'
    AND NOT EXISTS(SELECT 1 FROM "IntegracaoFaturamentoFonte" sf WHERE sf."parceiroId"=p_parceiro AND sf."reciboId"=p_recibo AND sf."merchantId"=c."idExterno")) THEN
    RAISE EXCEPTION 'O conjunto financeiro está incompleto.' USING ERRCODE='check_violation';
  END IF;
  total_valor:=0; total_pedidos:=0;
  FOR f IN SELECT sf.*,c."idExterno",c."lojaId",c."marcaId",c."ambiente",c."provedor",m."conexaoId" AS modulo_conexao,m."modulo",e."dia" AS dia_origem,e."perfil",e."fuso",s."situacao",s."geracao",s."execucaoId",s."numeroGrupos",s."pedidos" AS total_origem,
    l."valorCentavos",l."pedidos",l."clientes",l."origem",l."canal",l."data",l."lojaId" AS destino_loja,l."marcaId" AS destino_marca,l."chaveIdempotencia",l."origemRef"
    FROM "IntegracaoFaturamentoFonte" sf
    JOIN "IntegracaoConexao" c ON c."parceiroId"=sf."parceiroId" AND c."id"=sf."conexaoId"
    JOIN "IntegracaoConexaoModulo" m ON m."parceiroId"=sf."parceiroId" AND m."id"=sf."moduloId"
    JOIN "IntegracaoSnapshot" s ON s."parceiroId"=sf."parceiroId" AND s."id"=sf."snapshotId"
    JOIN "IntegracaoExecucao" e ON e."parceiroId"=s."parceiroId" AND e."id"=s."execucaoId" AND e."moduloId"=sf."moduloId"
    JOIN "FaturamentoLancamento" l ON l."parceiroId"=sf."parceiroId" AND l."id"=sf."lancamentoId"
    WHERE sf."parceiroId"=p_parceiro AND sf."reciboId"=p_recibo ORDER BY sf."merchantId"
  LOOP
    IF f."idExterno"<>f."merchantId" OR f."lojaId"<>r."lojaId" OR f."modulo_conexao"<>f."conexaoId" OR f."modulo"<>'ANALYTICS'
      OR f."ambiente"<>'PRODUCAO' OR f."provedor"<>'IFOOD' OR f."dia_origem"<>r."dia" OR f."dia"<>r."dia" OR f."perfil"<>'diario' OR f."fuso"<>'America/Sao_Paulo' OR f."situacao"<>'PUBLICADO'
      OR f."marcaAplicadaId" IS DISTINCT FROM f."marcaId" OR NOT erp_integracao_exigir_acesso(p_parceiro,f."moduloId",r."donoAplicacao",false)
      OR (SELECT count(*) FROM "IntegracaoConexao" c WHERE c."parceiroId"=p_parceiro AND c."provedor"='IFOOD' AND c."ambiente"='PRODUCAO' AND c."idExterno"=f."merchantId")<>1
      OR EXISTS(SELECT 1 FROM "IntegracaoSnapshot" s WHERE s."parceiroId"=p_parceiro AND s."execucaoId"=f."execucaoId" AND s."situacao"='PUBLICADO' AND s."geracao">f."geracao") THEN
      RAISE EXCEPTION 'Fonte financeira incompatível, obsoleta ou sem acesso.' USING ERRCODE='check_violation';
    END IF;
    -- Mesma fronteira do mapper v1: não arredonda, não desconta novamente e
    -- não converte dimensões ambíguas/NULL em ausência de venda.
    IF EXISTS(SELECT 1 FROM "KpiIfoodDia" k WHERE k."parceiroId"=p_parceiro AND k."snapshotId"=f."snapshotId"
      AND NOT coalesce(k."orderStatus"='CANCELLED' OR k."salesChannel" IN ('POS','DIGITAL_CATALOG') OR
        (k."orderStatus"='CONCLUDED' AND k."salesChannel"='IFOOD' AND k."category"='FOOD' AND k."deliveredBy" IN ('IFOOD_DELIVERY','MERCHANT_DELIVERY')),false))
      OR EXISTS(SELECT 1 FROM "KpiIfoodDia" k WHERE k."parceiroId"=p_parceiro AND k."snapshotId"=f."snapshotId" AND k."orderStatus"='CONCLUDED' AND k."salesChannel"='IFOOD'
        AND (k."gmvWithoutDelivery" IS NULL OR k."gmvWithoutDelivery"<0 OR k."pedidos"<0 OR (k."gmvWithoutDelivery">0 AND k."pedidos"=0))) THEN
      RAISE EXCEPTION 'Recorte financeiro não mapeado ou sem valor válido.' USING ERRCODE='check_violation';
    END IF;
    SELECT coalesce(sum(k."gmvWithoutDelivery"::numeric),0),coalesce(sum(k."pedidos"::numeric),0) INTO valor,pedidos FROM "KpiIfoodDia" k
      WHERE k."parceiroId"=p_parceiro AND k."snapshotId"=f."snapshotId" AND k."orderStatus"='CONCLUDED' AND k."salesChannel"='IFOOD';
    IF f."origem"<>'INTEGRACAO' OR f."canal"<>'IFOOD' OR f."data"<>r."dia" OR f."destino_loja"<>r."lojaId" OR f."destino_marca" IS DISTINCT FROM f."marcaAplicadaId" OR f."clientes" IS NOT NULL
      OR f."chaveIdempotencia"<>'ifood-analytics:dia:'||f."merchantId"||':'||to_char(r."dia",'YYYY-MM-DD') OR f."origemRef" IS DISTINCT FROM 'ifood-analytics:'||f."snapshotId"
      OR valor<>f."valorCentavos" OR pedidos<>f."pedidos" THEN
      RAISE EXCEPTION 'Destino financeiro diverge da fonte aplicada.' USING ERRCODE='check_violation';
    END IF;
    total_valor:=total_valor+valor; total_pedidos:=total_pedidos+pedidos; n:=n-1;
  END LOOP;
  IF n<>0 OR total_valor<0 OR total_valor>100000000 OR total_pedidos<0 OR total_pedidos>100000 OR (total_valor>0 AND total_pedidos=0)
    OR EXISTS(SELECT 1 FROM "FaturamentoLancamento" l WHERE l."parceiroId"=p_parceiro AND l."lojaId"=r."lojaId" AND l."data"=r."dia" AND l."canal"='IFOOD' AND l."origem"='INTEGRACAO'
      AND NOT EXISTS(SELECT 1 FROM "IntegracaoFaturamentoFonte" sf WHERE sf."parceiroId"=p_parceiro AND sf."reciboId"=p_recibo AND sf."lancamentoId"=l."id")) THEN
    RAISE EXCEPTION 'Conjunto financeiro divergente ou fora dos limites do grão.' USING ERRCODE='check_violation';
  END IF;
END $$;

CREATE FUNCTION erp_integracao_faturamento_concluir(p_parceiro text,p_recibo text,p_dono text,p_hash text,p_versao int,p_igual boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE r "IntegracaoFaturamentoDia"%ROWTYPE;
BEGIN
  SELECT h.* INTO r FROM "IntegracaoFaturamentoDia" h WHERE h."parceiroId"=p_parceiro AND h."id"=p_recibo;
  IF NOT FOUND OR r."transacaoAplicacao" IS DISTINCT FROM txid_current() OR r."donoAplicacao" IS DISTINCT FROM p_dono
    OR p_igual IS NULL OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR p_versao IS NULL OR p_versao<>1
    OR NOT erp_integracao_faturamento_posse(p_parceiro,p_dono) THEN RETURN false; END IF;
  IF p_igual AND (r."hashAplicado" IS DISTINCT FROM p_hash OR r."versaoMapaAplicada" IS DISTINCT FROM p_versao OR r."aplicadoEm" IS NULL) THEN RETURN false; END IF;
  UPDATE "IntegracaoFaturamentoDia" h SET "estado"='APLICADO',"motivo"=NULL,"hashAplicado"=p_hash,"versaoMapaAplicada"=p_versao,
    "aplicadoEm"=CASE WHEN p_igual THEN h."aplicadoEm" ELSE clock_timestamp() END,
    "revisaoConferida"=h."revisaoSolicitada","conferidaEm"=clock_timestamp(),"atualizadoEm"=clock_timestamp()
    WHERE h."parceiroId"=p_parceiro AND h."id"=p_recibo;
  PERFORM erp_integracao_faturamento_validar(p_parceiro,p_recibo);
  RETURN true;
END $$;

-- Privada: metadata de recusa continua registrável sem grant ativo. Nunca
-- libera dinheiro; a preparação acrescenta todos os gates e a ordem completa.
CREATE FUNCTION erp_integracao_faturamento_posse(p_parceiro text,p_dono text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE controle "IntegracaoControle"%ROWTYPE;
BEGIN
  IF p_parceiro IS NULL OR p_dono IS NULL OR p_parceiro IS DISTINCT FROM NULLIF(current_setting('app.parceiro_id',true),'') THEN RETURN false; END IF;
  SELECT c.* INTO controle FROM "IntegracaoControle" c WHERE c."id"='IFOOD_ANALYTICS' FOR SHARE;
  IF NOT FOUND OR controle."donoAtual" IS DISTINCT FROM p_dono OR NOT erp_integracao_posse_viva(p_dono) THEN RETURN false; END IF;
  PERFORM 1 FROM "ParceiroFlow" p WHERE p."id"=p_parceiro AND p."status"='ATIVO' AND NOT p."homologacaoDeIntegracao" FOR SHARE;
  RETURN FOUND;
END $$;

CREATE FUNCTION erp_integracao_faturamento_sinalizar(p_parceiro text,p_snapshot text,p_dono text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE loja_id text; dia_fonte date; ambiente_fonte text; recibo_id text;
BEGIN
  SELECT c."lojaId",e."dia",c."ambiente"::text INTO loja_id,dia_fonte,ambiente_fonte
    FROM "IntegracaoSnapshot" s JOIN "IntegracaoExecucao" e ON e."parceiroId"=s."parceiroId" AND e."id"=s."execucaoId"
    JOIN "IntegracaoConexaoModulo" m ON m."parceiroId"=e."parceiroId" AND m."id"=e."moduloId"
    JOIN "IntegracaoConexao" c ON c."parceiroId"=m."parceiroId" AND c."id"=m."conexaoId"
    WHERE s."parceiroId"=p_parceiro AND s."id"=p_snapshot AND e."perfil"='diario' AND m."modulo"='ANALYTICS' AND c."provedor"='IFOOD';
  IF NOT FOUND OR ambiente_fonte='TEST' THEN RETURN NULL; END IF;
  IF NOT erp_integracao_faturamento_posse(p_parceiro,p_dono) THEN RAISE EXCEPTION 'A sinalização perdeu o acesso ou a posse.' USING ERRCODE='check_violation'; END IF;
  INSERT INTO "IntegracaoFaturamentoDia"("id","parceiroId","lojaId","dia","atualizadoEm")
    VALUES (md5(random()::text||clock_timestamp()::text||p_snapshot),p_parceiro,loja_id,dia_fonte,clock_timestamp())
    ON CONFLICT ("parceiroId","lojaId","canal","dia","fonte") DO UPDATE SET
      "revisaoSolicitada"="IntegracaoFaturamentoDia"."revisaoSolicitada"+1,"solicitadaEm"=clock_timestamp(),
      "estado"='PENDENTE',"motivo"=NULL,"atualizadoEm"=clock_timestamp()
    RETURNING "id" INTO recibo_id;
  RETURN recibo_id;
END $$;

CREATE FUNCTION erp_integracao_faturamento_preparar(p_parceiro text,p_loja text,p_dia date,p_dono text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE r "IntegracaoFaturamentoDia"%ROWTYPE; c record; m record; motivo text; ids text[]; controle "IntegracaoControle"%ROWTYPE;
BEGIN
  IF p_dia IS NULL OR p_dia<DATE '2020-01-01' THEN RAISE EXCEPTION 'Dia financeiro inválido.' USING ERRCODE='check_violation'; END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('erp-faturamento:'||p_parceiro,0));
  PERFORM erp_integracao_travar_cobertura(p_parceiro,p_loja);
  IF NOT erp_integracao_faturamento_posse(p_parceiro,p_dono) THEN RAISE EXCEPTION 'A aplicação perdeu o acesso ou a posse.' USING ERRCODE='check_violation'; END IF;
  SELECT ctl.* INTO controle FROM "IntegracaoControle" ctl WHERE ctl."id"='IFOOD_ANALYTICS';
  PERFORM 1 FROM "Loja" l WHERE l."parceiroId"=p_parceiro AND l."id"=p_loja FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loja financeira inválida.' USING ERRCODE='check_violation'; END IF;
  -- Inclui conexões anteriores e religadas da mesma identidade comercial,
  -- inclusive de outra loja do parceiro; nunca filtra fora uma revogação.
  SELECT coalesce(array_agg(cn."id" ORDER BY cn."id"),ARRAY[]::text[]) INTO ids FROM "IntegracaoConexao" cn
    WHERE cn."parceiroId"=p_parceiro AND cn."provedor"='IFOOD' AND cn."ambiente"='PRODUCAO'
    AND (cn."lojaId"=p_loja OR cn."idExterno" IN (
      SELECT c0."idExterno" FROM "IntegracaoConexao" c0 WHERE c0."parceiroId"=p_parceiro AND c0."lojaId"=p_loja AND c0."provedor"='IFOOD' AND c0."ambiente"='PRODUCAO'
      UNION SELECT f."merchantId" FROM "IntegracaoFaturamentoFonte" f JOIN "IntegracaoFaturamentoDia" h ON h."parceiroId"=f."parceiroId" AND h."id"=f."reciboId" WHERE h."parceiroId"=p_parceiro AND h."lojaId"=p_loja AND h."dia"=p_dia));
  FOR c IN SELECT cn."id" FROM "IntegracaoConexao" cn WHERE cn."parceiroId"=p_parceiro AND cn."id"=ANY(ids) ORDER BY cn."id" FOR SHARE LOOP NULL; END LOOP;
  FOR m IN SELECT mo."id" FROM "IntegracaoConexaoModulo" mo WHERE mo."parceiroId"=p_parceiro AND mo."conexaoId"=ANY(ids) AND mo."modulo"='ANALYTICS' ORDER BY mo."id" FOR UPDATE LOOP NULL; END LOOP;
  PERFORM 1 FROM "LiberacaoDeModulo" l WHERE l."parceiroId"=p_parceiro AND l."modulo"='integracao' FOR SHARE;
  FOR m IN SELECT a."id" FROM "IntegracaoApp" a WHERE a."id" IN (SELECT mo."appId" FROM "IntegracaoConexaoModulo" mo WHERE mo."parceiroId"=p_parceiro AND mo."conexaoId"=ANY(ids) AND mo."modulo"='ANALYTICS') ORDER BY a."id" FOR SHARE LOOP NULL; END LOOP;
  -- Somente agora toca o recibo: publicador mantém módulo antes de sinalizar.
  INSERT INTO "IntegracaoFaturamentoDia"("id","parceiroId","lojaId","dia","atualizadoEm") VALUES
    (md5(random()::text||clock_timestamp()::text||p_dono),p_parceiro,p_loja,p_dia,clock_timestamp()) ON CONFLICT DO NOTHING;
  SELECT h.* INTO r FROM "IntegracaoFaturamentoDia" h WHERE h."parceiroId"=p_parceiro AND h."lojaId"=p_loja AND h."dia"=p_dia AND h."fonte"='ifood-analytics' AND h."canal"='IFOOD' FOR UPDATE;
  IF controle."pausada" OR controle."bloqueadaAte">clock_timestamp()
    OR NOT EXISTS(SELECT 1 FROM "Loja" l WHERE l."parceiroId"=p_parceiro AND l."id"=p_loja AND l."ativa" AND 'IFOOD'=ANY(l."canaisDeVenda")) THEN motivo:='ACESSO';
  ELSIF EXISTS(SELECT 1 FROM "PeriodoApuracao" p WHERE p."parceiroId"=p_parceiro AND p."status"='FECHADO' AND p_dia BETWEEN p."inicio" AND p."fim") THEN motivo:='PERIODO_FECHADO';
  ELSIF cardinality(ids)=0 THEN motivo:='COBERTURA_INCOMPLETA';
  ELSIF EXISTS(SELECT 1 FROM "IntegracaoConexao" cn WHERE cn."parceiroId"=p_parceiro AND cn."id"=ANY(ids) GROUP BY cn."idExterno" HAVING count(*)<>1)
    OR EXISTS(SELECT 1 FROM "IntegracaoConexao" cn WHERE cn."parceiroId"=p_parceiro AND cn."id"=ANY(ids) AND cn."lojaId"<>p_loja) THEN motivo:='VINCULO_AMBIGUO';
  ELSIF EXISTS(SELECT 1 FROM "IntegracaoFaturamentoFonte" f JOIN "IntegracaoConexao" cn ON cn."parceiroId"=f."parceiroId" AND cn."id"=f."conexaoId" WHERE f."parceiroId"=p_parceiro AND f."reciboId"=r."id" AND f."marcaAplicadaId" IS DISTINCT FROM cn."marcaId") THEN motivo:='MARCA_DIVERGENTE';
  ELSIF EXISTS(SELECT 1 FROM "FaturamentoLancamento" l WHERE l."parceiroId"=p_parceiro AND l."lojaId"=p_loja AND l."data"=p_dia AND l."canal"='IFOOD' AND l."origem"='INTEGRACAO' AND l."chaveIdempotencia" NOT LIKE 'ifood-analytics:dia:%') THEN motivo:='OUTRA_INTEGRACAO';
  END IF;
  IF motivo IS NULL THEN
    FOR c IN SELECT cn."id",mo."id" AS modulo FROM "IntegracaoConexao" cn LEFT JOIN "IntegracaoConexaoModulo" mo ON mo."parceiroId"=cn."parceiroId" AND mo."conexaoId"=cn."id" AND mo."modulo"='ANALYTICS' WHERE cn."parceiroId"=p_parceiro AND cn."id"=ANY(ids) ORDER BY cn."id" LOOP
      IF c.modulo IS NULL OR NOT erp_integracao_exigir_acesso(p_parceiro,c.modulo,p_dono,false) THEN motivo:='ACESSO'; EXIT; END IF;
      IF NOT EXISTS(SELECT 1 FROM "IntegracaoSnapshot" s JOIN "IntegracaoExecucao" e ON e."parceiroId"=s."parceiroId" AND e."id"=s."execucaoId" WHERE e."parceiroId"=p_parceiro AND e."moduloId"=c.modulo AND e."dia"=p_dia AND e."perfil"='diario' AND s."situacao"='PUBLICADO') THEN motivo:='COBERTURA_INCOMPLETA'; EXIT; END IF;
    END LOOP;
  END IF;
  IF motivo IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'reciboId',r."id",'motivo',motivo); END IF;
  UPDATE "IntegracaoFaturamentoDia" h SET "transacaoAplicacao"=txid_current(),"donoAplicacao"=p_dono,"atualizadoEm"=clock_timestamp() WHERE h."id"=r."id" AND h."parceiroId"=p_parceiro;
  RETURN jsonb_build_object('ok',true,'reciboId',r."id");
END $$;

-- Confere o prefixo já retido; não toma locks em ordem inversa nos triggers.
-- O dono físico continua confiável (pode alterar DDL). O papel erp_tenant
-- não recebe DML no recibo nem EXECUTE nestas rotinas privadas.
CREATE FUNCTION erp_integracao_faturamento_travas(p_parceiro text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
  SELECT count(*)=2 FROM unnest(ARRAY[
    hashtextextended('erp-faturamento:'||p_parceiro,0),
    hashtextextended('erp-integracao-faturamento:'||p_parceiro,0)
  ]) WITH ORDINALITY q(chave,ord) WHERE EXISTS(
    SELECT 1 FROM pg_locks l WHERE l.pid=pg_backend_pid() AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database())
      AND l.locktype='advisory' AND l.objsubid=1 AND l.granted
      AND l.classid::bigint=((q.chave >> 32) & 4294967295::bigint) AND l.objid::bigint=(q.chave & 4294967295::bigint)
      AND (l.mode='ExclusiveLock' OR (q.ord=1 AND l.mode='ShareLock'))
  )
$$;

CREATE FUNCTION erp_integracao_faturamento_header() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'O recibo financeiro não pode ser removido.' USING ERRCODE='check_violation'; END IF;
  IF NEW."parceiroId" IS DISTINCT FROM NULLIF(current_setting('app.parceiro_id',true),'') THEN RAISE EXCEPTION 'Contexto do recibo financeiro inválido.' USING ERRCODE='check_violation'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW."transacaoAplicacao" IS NOT NULL OR NEW."donoAplicacao" IS NOT NULL OR NEW."hashAplicado" IS NOT NULL OR NEW."versaoMapaAplicada" IS NOT NULL OR NEW."aplicadoEm" IS NOT NULL OR NEW."estado"<>'PENDENTE' THEN
      RAISE EXCEPTION 'O recibo deve nascer sem preparação ou aplicação.' USING ERRCODE='check_violation';
    END IF;
  ELSE
    IF ROW(NEW."id",NEW."parceiroId",NEW."lojaId",NEW."dia",NEW."canal",NEW."fonte") IS DISTINCT FROM ROW(OLD."id",OLD."parceiroId",OLD."lojaId",OLD."dia",OLD."canal",OLD."fonte") THEN
      RAISE EXCEPTION 'A identidade do recibo financeiro é imutável.' USING ERRCODE='check_violation';
    END IF;
    IF ROW(NEW."transacaoAplicacao",NEW."donoAplicacao") IS DISTINCT FROM ROW(OLD."transacaoAplicacao",OLD."donoAplicacao") THEN
      IF NOT erp_integracao_faturamento_travas(NEW."parceiroId")
        OR (NEW."transacaoAplicacao" IS NOT NULL AND NEW."transacaoAplicacao"<>txid_current())
        OR (NEW."transacaoAplicacao" IS NULL AND OLD."transacaoAplicacao" IS DISTINCT FROM txid_current())
        OR NOT erp_integracao_faturamento_posse(NEW."parceiroId",coalesce(NEW."donoAplicacao",OLD."donoAplicacao")) THEN
        RAISE EXCEPTION 'A preparação financeira exige o prefixo de locks e posse viva.' USING ERRCODE='check_violation';
      END IF;
    END IF;
    IF ROW(NEW."hashAplicado",NEW."versaoMapaAplicada",NEW."aplicadoEm") IS DISTINCT FROM ROW(OLD."hashAplicado",OLD."versaoMapaAplicada",OLD."aplicadoEm") OR NEW."estado"='APLICADO' THEN
      IF NEW."transacaoAplicacao" IS DISTINCT FROM txid_current() OR NOT erp_integracao_faturamento_travas(NEW."parceiroId") OR NOT erp_integracao_faturamento_posse(NEW."parceiroId",NEW."donoAplicacao") THEN
        RAISE EXCEPTION 'A confirmação financeira exige preparação nesta transação.' USING ERRCODE='check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION erp_integracao_faturamento_fonte() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE r "IntegracaoFaturamentoDia"%ROWTYPE;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'A fonte financeira não pode ser removida.' USING ERRCODE='check_violation'; END IF;
  IF NEW."parceiroId" IS DISTINCT FROM NULLIF(current_setting('app.parceiro_id',true),'') THEN RAISE EXCEPTION 'Contexto da fonte financeira inválido.' USING ERRCODE='check_violation'; END IF;
  SELECT h.* INTO r FROM "IntegracaoFaturamentoDia" h WHERE h."parceiroId"=NEW."parceiroId" AND h."id"=NEW."reciboId";
  IF NOT FOUND OR r."transacaoAplicacao" IS DISTINCT FROM txid_current() OR NOT erp_integracao_faturamento_travas(NEW."parceiroId") OR NOT erp_integracao_faturamento_posse(NEW."parceiroId",r."donoAplicacao") THEN
    RAISE EXCEPTION 'A fonte exige preparação financeira nesta transação.' USING ERRCODE='check_violation';
  END IF;
  IF TG_OP='UPDATE' AND ROW(NEW."id",NEW."parceiroId",NEW."reciboId",NEW."dia",NEW."merchantId",NEW."conexaoId",NEW."moduloId",NEW."lancamentoId",NEW."marcaAplicadaId") IS DISTINCT FROM ROW(OLD."id",OLD."parceiroId",OLD."reciboId",OLD."dia",OLD."merchantId",OLD."conexaoId",OLD."moduloId",OLD."lancamentoId",OLD."marcaAplicadaId") THEN
    RAISE EXCEPTION 'A identidade comercial e o destino da fonte são imutáveis.' USING ERRCODE='check_violation';
  END IF;
  IF NEW."dia"<>r."dia" OR NOT EXISTS(
    SELECT 1 FROM "IntegracaoSnapshot" s JOIN "IntegracaoExecucao" e ON e."parceiroId"=s."parceiroId" AND e."id"=s."execucaoId"
    JOIN "IntegracaoConexaoModulo" m ON m."parceiroId"=e."parceiroId" AND m."id"=e."moduloId"
    JOIN "IntegracaoConexao" c ON c."parceiroId"=m."parceiroId" AND c."id"=m."conexaoId"
    WHERE s."parceiroId"=NEW."parceiroId" AND s."id"=NEW."snapshotId" AND s."situacao"='PUBLICADO' AND e."perfil"='diario' AND e."dia"=r."dia"
      AND m."id"=NEW."moduloId" AND m."modulo"='ANALYTICS' AND c."id"=NEW."conexaoId" AND c."idExterno"=NEW."merchantId"
      AND c."lojaId"=r."lojaId" AND c."marcaId" IS NOT DISTINCT FROM NEW."marcaAplicadaId" AND c."provedor"='IFOOD' AND c."ambiente"='PRODUCAO'
  ) THEN RAISE EXCEPTION 'A fonte não corresponde à fotografia, ao vínculo e ao dia preparados.' USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION erp_integracao_faturamento_destino() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE r "IntegracaoFaturamentoDia"%ROWTYPE; antigo boolean;
BEGIN
  antigo:=TG_OP<>'INSERT' AND coalesce(OLD."chaveIdempotencia" LIKE 'ifood-analytics:dia:%',false);
  IF TG_OP='DELETE' THEN
    IF antigo THEN RAISE EXCEPTION 'O destino Analytics não pode ser removido.' USING ERRCODE='check_violation'; END IF;
    RETURN OLD;
  END IF;
  IF antigo OR coalesce(NEW."chaveIdempotencia" LIKE 'ifood-analytics:dia:%',false) THEN
    IF NEW."parceiroId" IS DISTINCT FROM NULLIF(current_setting('app.parceiro_id',true),'') OR NEW."origem"<>'INTEGRACAO' OR NEW."canal"<>'IFOOD' OR NEW."clientes" IS NOT NULL OR NOT coalesce(NEW."chaveIdempotencia" LIKE 'ifood-analytics:dia:%',false) THEN
      RAISE EXCEPTION 'Namespace financeiro Analytics incompatível.' USING ERRCODE='check_violation';
    END IF;
    IF antigo AND ROW(NEW."id",NEW."parceiroId",NEW."lojaId",NEW."data",NEW."canal",NEW."marcaId",NEW."chaveIdempotencia") IS DISTINCT FROM ROW(OLD."id",OLD."parceiroId",OLD."lojaId",OLD."data",OLD."canal",OLD."marcaId",OLD."chaveIdempotencia") THEN
      RAISE EXCEPTION 'A identidade do destino Analytics é imutável.' USING ERRCODE='check_violation';
    END IF;
    SELECT h.* INTO r FROM "IntegracaoFaturamentoDia" h WHERE h."parceiroId"=NEW."parceiroId" AND h."lojaId"=NEW."lojaId" AND h."dia"=NEW."data" AND h."canal"='IFOOD' AND h."fonte"='ifood-analytics';
    IF NOT FOUND OR r."transacaoAplicacao" IS DISTINCT FROM txid_current() OR NOT erp_integracao_faturamento_travas(NEW."parceiroId") OR NOT erp_integracao_faturamento_posse(NEW."parceiroId",r."donoAplicacao") THEN
      RAISE EXCEPTION 'O destino exige preparação financeira nesta transação.' USING ERRCODE='check_violation';
    END IF;
  ELSIF NEW."origem"='INTEGRACAO' AND NEW."canal"='IFOOD' THEN
    -- Uma fonte diferente não pode entrar depois da prova de completude da
    -- ponte. O lançamento manual/CSV continua com seu próprio contrato.
    PERFORM erp_integracao_travar_cobertura(NEW."parceiroId",NEW."lojaId");
    IF EXISTS(SELECT 1 FROM "IntegracaoFaturamentoDia" h WHERE h."parceiroId"=NEW."parceiroId" AND h."lojaId"=NEW."lojaId" AND h."dia"=NEW."data" AND (h."hashAplicado" IS NOT NULL OR h."transacaoAplicacao"=txid_current())) THEN
      RAISE EXCEPTION 'Outra integração já ocupa o conjunto Analytics.' USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION erp_integracao_faturamento_final() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE recibo text; transacao bigint;
BEGIN
  IF TG_TABLE_NAME='IntegracaoFaturamentoDia' THEN
    SELECT h."id",h."transacaoAplicacao" INTO recibo,transacao FROM "IntegracaoFaturamentoDia" h WHERE h."parceiroId"=NEW."parceiroId" AND h."id"=NEW."id";
    IF transacao IS DISTINCT FROM txid_current() THEN RETURN NULL; END IF;
  ELSIF TG_TABLE_NAME='IntegracaoFaturamentoFonte' THEN recibo:=NEW."reciboId";
  ELSE
    IF NOT coalesce(NEW."chaveIdempotencia" LIKE 'ifood-analytics:dia:%',false) THEN RETURN NULL; END IF;
    SELECT f."reciboId" INTO recibo FROM "IntegracaoFaturamentoFonte" f WHERE f."parceiroId"=NEW."parceiroId" AND f."lancamentoId"=NEW."id";
    IF NOT FOUND THEN RAISE EXCEPTION 'Destino Analytics sem fonte aplicada.' USING ERRCODE='check_violation'; END IF;
  END IF;
  PERFORM erp_integracao_faturamento_validar(NEW."parceiroId",recibo);
  RETURN NULL;
END $$;

CREATE TRIGGER "IntegracaoConexao_cobertura" BEFORE INSERT ON "IntegracaoConexao" FOR EACH ROW EXECUTE FUNCTION erp_integracao_conexao_cobertura();
CREATE TRIGGER "IntegracaoConexao_sinaliza_cobertura" AFTER INSERT ON "IntegracaoConexao" FOR EACH ROW EXECUTE FUNCTION erp_integracao_conexao_cobertura();
CREATE TRIGGER "IFFDia_protocolo" BEFORE INSERT OR UPDATE OR DELETE ON "IntegracaoFaturamentoDia" FOR EACH ROW EXECUTE FUNCTION erp_integracao_faturamento_header();
CREATE TRIGGER "IFFDia_sem_truncate" BEFORE TRUNCATE ON "IntegracaoFaturamentoDia" FOR EACH STATEMENT EXECUTE FUNCTION erp_integracao_faturamento_header();
CREATE TRIGGER "IFFFonte_protocolo" BEFORE INSERT OR UPDATE OR DELETE ON "IntegracaoFaturamentoFonte" FOR EACH ROW EXECUTE FUNCTION erp_integracao_faturamento_fonte();
CREATE TRIGGER "IFFFonte_sem_truncate" BEFORE TRUNCATE ON "IntegracaoFaturamentoFonte" FOR EACH STATEMENT EXECUTE FUNCTION erp_integracao_faturamento_fonte();
CREATE TRIGGER "FaturamentoLancamento_analytics" BEFORE INSERT OR UPDATE OR DELETE ON "FaturamentoLancamento" FOR EACH ROW EXECUTE FUNCTION erp_integracao_faturamento_destino();
CREATE CONSTRAINT TRIGGER "IFFDia_completo" AFTER INSERT OR UPDATE ON "IntegracaoFaturamentoDia" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_integracao_faturamento_final();
CREATE CONSTRAINT TRIGGER "IFFFonte_completa" AFTER INSERT OR UPDATE ON "IntegracaoFaturamentoFonte" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_integracao_faturamento_final();
CREATE CONSTRAINT TRIGGER "FaturamentoLancamento_analytics_completo" AFTER INSERT OR UPDATE ON "FaturamentoLancamento" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_integracao_faturamento_final();

DO $$
DECLARE tabela text; tem_rls boolean;
BEGIN
  SELECT coalesce(relrowsecurity,false) INTO tem_rls FROM pg_class WHERE oid=to_regclass('"Loja"');
  FOREACH tabela IN ARRAY ARRAY['IntegracaoFaturamentoDia','IntegracaoFaturamentoFonte'] LOOP
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',tabela);
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='erp_tenant') THEN
      EXECUTE format('REVOKE ALL ON %I FROM erp_tenant',tabela);
      IF tem_rls THEN
        EXECUTE format('GRANT SELECT ON %I TO erp_tenant',tabela);
        IF tabela='IntegracaoFaturamentoFonte' THEN EXECUTE format('GRANT INSERT, UPDATE ON %I TO erp_tenant',tabela); END IF;
      END IF;
    END IF;
    IF tem_rls THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tabela);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tabela);
      EXECUTE format('CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL TO erp_tenant USING ("parceiroId"=NULLIF(current_setting(''app.parceiro_id'',true),'''')) WITH CHECK ("parceiroId"=NULLIF(current_setting(''app.parceiro_id'',true),''''))',tabela||'_do_parceiro',tabela);
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION erp_integracao_travar_cobertura(text,text),erp_integracao_conexao_cobertura(),erp_integracao_faturamento_pendencia(text,text,text,text),erp_integracao_faturamento_validar(text,text),erp_integracao_faturamento_concluir(text,text,text,text,int,boolean),erp_integracao_faturamento_posse(text,text),erp_integracao_faturamento_sinalizar(text,text,text),erp_integracao_faturamento_preparar(text,text,date,text),erp_integracao_faturamento_travas(text),erp_integracao_faturamento_header(),erp_integracao_faturamento_fonte(),erp_integracao_faturamento_destino(),erp_integracao_faturamento_final() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='erp_tenant') THEN
    GRANT EXECUTE ON FUNCTION erp_integracao_travar_cobertura(text,text),erp_integracao_faturamento_sinalizar(text,text,text),erp_integracao_faturamento_preparar(text,text,date,text),erp_integracao_faturamento_pendencia(text,text,text,text),erp_integracao_faturamento_concluir(text,text,text,text,int,boolean) TO erp_tenant;
  END IF;
END $$;
RESET search_path;
