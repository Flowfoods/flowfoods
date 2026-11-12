-- Recibos das fontes mensais apresentadas ao nível 1, para conferência.
CREATE TABLE "IntegracaoReciboFinancial" (
  "id" text NOT NULL PRIMARY KEY,
  "parceiroId" text NOT NULL,
  "lojaId" text NOT NULL,
  "conexaoId" text NOT NULL,
  "moduloId" text NOT NULL,
  "merchantId" text NOT NULL,
  "ambiente" "AmbienteDeIntegracao" NOT NULL,
  "competencia" text NOT NULL,
  "produto" text NOT NULL,
  "versao" integer NOT NULL DEFAULT 1,
  "origem" text NOT NULL DEFAULT 'MANUAL_DECLARADA',
  "situacao" text NOT NULL DEFAULT 'RECEBIDO_PARA_CONFERENCIA',
  "recebidoEm" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recebidoPorId" text NOT NULL,
  "requestIdSha256" text NOT NULL,
  "arquivoSha256" text NOT NULL,
  "manifestoSha256" text NOT NULL,
  "eventosSha256" text NOT NULL,
  "vigenciasSha256" text NOT NULL,
  "pacoteSha256" text NOT NULL,
  "linhasArquivo" integer NOT NULL,
  "pedidosDistintos" integer NOT NULL,
  "paginasEventos" integer NOT NULL,
  "quantidadeEventos" integer NOT NULL,
  "vigencias" jsonb NOT NULL,
  CONSTRAINT "IFRecibo_parceiro_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IFRecibo_loja_fkey" FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja" ("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IFRecibo_conexao_fkey" FOREIGN KEY ("parceiroId", "conexaoId") REFERENCES "IntegracaoConexao" ("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IFRecibo_modulo_fkey" FOREIGN KEY ("parceiroId", "moduloId") REFERENCES "IntegracaoConexaoModulo" ("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IFRecibo_identidade" CHECK (
    "competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left("competencia", 4) <> '0000'
    AND "produto" ~ '^[A-Za-z0-9_-]{1,120}$'
    AND "merchantId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND length(btrim("recebidoPorId")) BETWEEN 1 AND 128
  ),
  CONSTRAINT "IFRecibo_estado" CHECK ("versao" = 1 AND "origem" = 'MANUAL_DECLARADA' AND "situacao" = 'RECEBIDO_PARA_CONFERENCIA'),
  CONSTRAINT "IFRecibo_hashes" CHECK (
    "requestIdSha256" ~ '^[0-9a-f]{64}$' AND "arquivoSha256" ~ '^[0-9a-f]{64}$'
    AND "manifestoSha256" ~ '^[0-9a-f]{64}$' AND "eventosSha256" ~ '^[0-9a-f]{64}$'
    AND "vigenciasSha256" ~ '^[0-9a-f]{64}$' AND "pacoteSha256" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "IFRecibo_contagens" CHECK (
    "pedidosDistintos" BETWEEN 0 AND "linhasArquivo" AND "paginasEventos" >= 1 AND "quantidadeEventos" >= 0
  ),
  CONSTRAINT "IFRecibo_vigencias" CHECK (jsonb_typeof("vigencias") = 'array' AND jsonb_array_length("vigencias") BETWEEN 1 AND 31)
);

CREATE UNIQUE INDEX "IFRecibo_tenant_key" ON "IntegracaoReciboFinancial" ("parceiroId", "id");
CREATE UNIQUE INDEX "IFRecibo_pacote_key" ON "IntegracaoReciboFinancial" ("parceiroId", "conexaoId", "competencia", "pacoteSha256");
CREATE INDEX "IFRecibo_loja_mes_idx" ON "IntegracaoReciboFinancial" ("parceiroId", "lojaId", "ambiente", "competencia", "recebidoEm" DESC, "id" DESC);

DO $$ BEGIN EXECUTE format('SET search_path = %I, pg_temp', current_schema()); END $$;

-- O nível 1 é autenticado no servidor. O banco verifica o vínculo no instante
-- da escrita. As travas se mantêm até o commit, inclusive em reenvios.
CREATE FUNCTION erp_financial_validar_recibo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE
  v jsonb;
  primeiro_dia date := (NEW."competencia" || '-01')::date;
  ultimo_dia date := (primeiro_dia + interval '1 month' - interval '1 day')::date;
  proximo_dia date := primeiro_dia;
  inicio date;
  fim date;
BEGIN
  IF NEW."parceiroId" IS DISTINCT FROM NULLIF(current_setting('app.parceiro_id', true), '') THEN
    RAISE EXCEPTION 'erp_financial_fontes_indisponiveis' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1
    FROM "ParceiroFlow" p
    JOIN "IntegracaoConexao" c ON c."parceiroId" = p."id"
    JOIN "IntegracaoConexaoModulo" m ON m."parceiroId" = p."id" AND m."conexaoId" = c."id"
    JOIN "LiberacaoDeModulo" l ON l."parceiroId" = p."id" AND l."modulo" = 'integracao'
    WHERE p."id" = NEW."parceiroId" AND p."status" = 'ATIVO'
      AND p."homologacaoDeIntegracao" = (NEW."ambiente" = 'TEST')
      AND c."id" = NEW."conexaoId" AND c."lojaId" = NEW."lojaId" AND c."idExterno" = NEW."merchantId"
      AND c."ambiente" = NEW."ambiente" AND c."provedor" = 'IFOOD' AND c."estado" = 'ATIVA'
      AND m."id" = NEW."moduloId" AND m."modulo" = 'FINANCIAL' AND m."estado" IN ('AUTORIZADO', 'ATIVO')
      AND l."liberado"
    FOR SHARE OF p, c, m, l;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'erp_financial_fontes_indisponiveis' USING ERRCODE = 'check_violation';
  END IF;

  -- Em JSONB só cabem as quatro propriedades conhecidas de cada faixa.
  FOR v IN SELECT * FROM jsonb_array_elements(NEW."vigencias") LOOP
    IF jsonb_typeof(v) IS DISTINCT FROM 'object'
      OR NOT (v ?& ARRAY['inicio', 'fim', 'comissaoBp', 'pagamentoBp'])
      OR v - ARRAY['inicio', 'fim', 'comissaoBp', 'pagamentoBp'] <> '{}'::jsonb
      OR jsonb_typeof(v->'inicio') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'fim') IS DISTINCT FROM 'string'
      OR (v->>'inicio') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (v->>'fim') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      OR jsonb_typeof(v->'comissaoBp') IS DISTINCT FROM 'number' OR jsonb_typeof(v->'pagamentoBp') IS DISTINCT FROM 'number'
      OR (v->>'comissaoBp') !~ '^[0-9]{1,4}$' OR (v->>'pagamentoBp') !~ '^[0-9]{1,4}$'
    THEN RAISE EXCEPTION 'IFRecibo_vigencias invalidas' USING ERRCODE = 'check_violation'; END IF;
    inicio := (v->>'inicio')::date;
    fim := (v->>'fim')::date;
    IF inicio > fim OR inicio > ultimo_dia OR fim < primeiro_dia OR greatest(inicio, primeiro_dia) <> proximo_dia
       OR (v->>'comissaoBp')::integer + (v->>'pagamentoBp')::integer >= 10000 THEN
      RAISE EXCEPTION 'IFRecibo_vigencias invalidas' USING ERRCODE = 'check_violation';
    END IF;
    proximo_dia := least(fim, ultimo_dia) + 1;
  END LOOP;
  IF proximo_dia <> ultimo_dia + 1 THEN RAISE EXCEPTION 'IFRecibo_vigencias incompletas' USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "IFRecibo_confere" BEFORE INSERT ON "IntegracaoReciboFinancial" FOR EACH ROW EXECUTE FUNCTION erp_financial_validar_recibo();
CREATE TRIGGER "IFRecibo_parceiro_imutavel" BEFORE UPDATE ON "IntegracaoReciboFinancial" FOR EACH ROW EXECUTE FUNCTION erp_parceiro_imutavel();
CREATE TRIGGER "IFRecibo_imutavel" BEFORE UPDATE OR DELETE ON "IntegracaoReciboFinancial" FOR EACH ROW EXECUTE FUNCTION erp_integracao_so_inclusao();
CREATE TRIGGER "IFRecibo_sem_truncate" BEFORE TRUNCATE ON "IntegracaoReciboFinancial" FOR EACH STATEMENT EXECUTE FUNCTION erp_integracao_so_inclusao();

REVOKE ALL ON "IntegracaoReciboFinancial" FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_financial_validar_recibo() FROM PUBLIC;
DO $$
BEGIN
  IF (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('"Loja"')) THEN
    ALTER TABLE "IntegracaoReciboFinancial" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "IntegracaoReciboFinancial" FORCE ROW LEVEL SECURITY;
    CREATE POLICY "IFRecibo_do_parceiro" ON "IntegracaoReciboFinancial" FOR ALL TO erp_tenant
      USING ("parceiroId" = NULLIF(current_setting('app.parceiro_id', true), ''))
      WITH CHECK ("parceiroId" = NULLIF(current_setting('app.parceiro_id', true), ''));
    GRANT SELECT, INSERT ON "IntegracaoReciboFinancial" TO erp_tenant;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "IntegracaoReciboFinancial" FROM erp_tenant;
    REVOKE ALL ON FUNCTION erp_financial_validar_recibo() FROM erp_tenant;
  END IF;
END $$;
RESET search_path;
