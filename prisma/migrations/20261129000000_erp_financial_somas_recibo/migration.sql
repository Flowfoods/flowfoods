-- O recibo original é imutável. Um reenvio do mesmo conjunto pode completar
-- um recibo antigo sem alterar a data ou gerar um novo recebimento.
CREATE TABLE "IntegracaoSomasFinancial" (
  "parceiroId" text NOT NULL,
  "reciboId" text NOT NULL,
  "arquivoCentavos" text NOT NULL,
  "eventosCentavos" text NOT NULL,
  CONSTRAINT "IFSomas_pkey" PRIMARY KEY ("parceiroId", "reciboId"),
  CONSTRAINT "IFSomas_parceiro_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow" (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IFSomas_recibo_fkey" FOREIGN KEY ("parceiroId", "reciboId") REFERENCES "IntegracaoReciboFinancial" ("parceiroId", id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IFSomas_centavos" CHECK (
    "arquivoCentavos" ~ '^(0|-?[1-9][0-9]{0,89})$'
    AND "eventosCentavos" ~ '^(0|-?[1-9][0-9]{0,89})$'
  )
);

DO $$ BEGIN EXECUTE format('SET search_path = %I, pg_temp', current_schema()); END $$;
CREATE FUNCTION erp_financial_validar_somas_recibo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
BEGIN
  IF NEW."parceiroId" IS DISTINCT FROM NULLIF(current_setting('app.parceiro_id', true), '') THEN
    RAISE EXCEPTION 'erp_financial_fontes_indisponiveis' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM "IntegracaoReciboFinancial" r
    JOIN "ParceiroFlow" p ON p.id = r."parceiroId"
    JOIN "IntegracaoConexao" c ON (c."parceiroId", c.id) = (r."parceiroId", r."conexaoId")
    JOIN "IntegracaoConexaoModulo" m ON (m."parceiroId", m."conexaoId", m.id) = (r."parceiroId", c.id, r."moduloId")
    JOIN "LiberacaoDeModulo" l ON l."parceiroId" = p.id AND l.modulo = 'integracao'
    WHERE r."parceiroId" = NEW."parceiroId" AND r.id = NEW."reciboId"
      AND p.status = 'ATIVO' AND p."homologacaoDeIntegracao" = (r.ambiente = 'TEST')
      AND c.estado = 'ATIVA' AND c."provedor" = 'IFOOD' AND c.ambiente = r.ambiente
      AND c."idExterno" = r."merchantId" AND c."lojaId" = r."lojaId"
      AND m.modulo = 'FINANCIAL' AND m.estado IN ('AUTORIZADO', 'ATIVO') AND l.liberado
    FOR SHARE OF p, c, m, l;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'erp_financial_fontes_indisponiveis' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "IFSomas_confere" BEFORE INSERT ON "IntegracaoSomasFinancial" FOR EACH ROW EXECUTE FUNCTION erp_financial_validar_somas_recibo();
CREATE TRIGGER "IFSomas_parceiro_imutavel" BEFORE UPDATE ON "IntegracaoSomasFinancial" FOR EACH ROW EXECUTE FUNCTION erp_parceiro_imutavel();
CREATE TRIGGER "IFSomas_imutavel" BEFORE UPDATE OR DELETE ON "IntegracaoSomasFinancial" FOR EACH ROW EXECUTE FUNCTION erp_integracao_so_inclusao();
CREATE TRIGGER "IFSomas_sem_truncate" BEFORE TRUNCATE ON "IntegracaoSomasFinancial" FOR EACH STATEMENT EXECUTE FUNCTION erp_integracao_so_inclusao();

REVOKE ALL ON "IntegracaoSomasFinancial" FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_financial_validar_somas_recibo() FROM PUBLIC;
DO $$
BEGIN
  IF (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('"Loja"')) THEN
    ALTER TABLE "IntegracaoSomasFinancial" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "IntegracaoSomasFinancial" FORCE ROW LEVEL SECURITY;
    CREATE POLICY "IFSomas_do_parceiro" ON "IntegracaoSomasFinancial" FOR ALL TO erp_tenant
      USING ("parceiroId" = NULLIF(current_setting('app.parceiro_id', true), ''))
      WITH CHECK ("parceiroId" = NULLIF(current_setting('app.parceiro_id', true), ''));
    GRANT SELECT, INSERT ON "IntegracaoSomasFinancial" TO erp_tenant;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "IntegracaoSomasFinancial" FROM erp_tenant;
    REVOKE ALL ON FUNCTION erp_financial_validar_somas_recibo() FROM erp_tenant;
  END IF;
END $$;
RESET search_path;
