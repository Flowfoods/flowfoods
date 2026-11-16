-- O mapa v2 reconhece EMBEDDED_UBER como canal externo; somente IFOOD compõe o faturamento.
-- CREATE OR REPLACE preserva as permissões das funções existentes durante a atualização do worker.
BEGIN;

DO $$ BEGIN EXECUTE format('SET LOCAL search_path = %I, pg_temp', current_schema()); END $$;

CREATE OR REPLACE FUNCTION erp_integracao_faturamento_validar(p_parceiro text,p_recibo text) RETURNS void
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
    -- A versão gravada no recibo governa os canais externos reconhecidos.
    IF EXISTS(SELECT 1 FROM "KpiIfoodDia" k WHERE k."parceiroId"=p_parceiro AND k."snapshotId"=f."snapshotId"
      AND NOT coalesce(k."orderStatus"='CANCELLED' OR k."salesChannel" IN ('POS','DIGITAL_CATALOG') OR
        (r."versaoMapaAplicada"=2 AND k."salesChannel"='EMBEDDED_UBER') OR
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

CREATE OR REPLACE FUNCTION erp_integracao_faturamento_concluir(p_parceiro text,p_recibo text,p_dono text,p_hash text,p_versao int,p_igual boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE r "IntegracaoFaturamentoDia"%ROWTYPE;
BEGIN
  SELECT h.* INTO r FROM "IntegracaoFaturamentoDia" h WHERE h."parceiroId"=p_parceiro AND h."id"=p_recibo;
  IF NOT FOUND OR r."transacaoAplicacao" IS DISTINCT FROM txid_current() OR r."donoAplicacao" IS DISTINCT FROM p_dono
    OR p_igual IS NULL OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR p_versao IS NULL OR p_versao NOT IN (1,2)
    OR coalesce(r."versaoMapaAplicada",0)>p_versao
    OR NOT erp_integracao_faturamento_posse(p_parceiro,p_dono) THEN RETURN false; END IF;
  IF p_igual AND (r."hashAplicado" IS DISTINCT FROM p_hash OR r."versaoMapaAplicada" IS DISTINCT FROM p_versao OR r."aplicadoEm" IS NULL) THEN RETURN false; END IF;
  UPDATE "IntegracaoFaturamentoDia" h SET "estado"='APLICADO',"motivo"=NULL,"hashAplicado"=p_hash,"versaoMapaAplicada"=p_versao,
    "aplicadoEm"=CASE WHEN p_igual THEN h."aplicadoEm" ELSE clock_timestamp() END,
    "revisaoConferida"=h."revisaoSolicitada","conferidaEm"=clock_timestamp(),"atualizadoEm"=clock_timestamp()
    WHERE h."parceiroId"=p_parceiro AND h."id"=p_recibo;
  PERFORM erp_integracao_faturamento_validar(p_parceiro,p_recibo);
  RETURN true;
END $$;

COMMIT;
