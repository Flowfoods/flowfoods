BEGIN;

DO $$ BEGIN EXECUTE format('SET LOCAL search_path = %I, pg_temp', current_schema()); END $$;

CREATE TABLE "IntegracaoEventoIfood" (
  "id" TEXT PRIMARY KEY,
  "parceiroId" TEXT NOT NULL,
  "lojaId" TEXT NOT NULL,
  "conexaoId" TEXT NOT NULL,
  "ambiente" "AmbienteDeIntegracao" NOT NULL,
  "merchantId" TEXT NOT NULL,
  "eventoId" TEXT NOT NULL,
  "pedidoId" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "codigoCompleto" TEXT NOT NULL,
  "criadoNoIfoodEm" TEXT NOT NULL,
  "categoria" TEXT,
  "canal" TEXT,
  "recebidoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IfoodEvento_parceiro_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "IfoodEvento_conexao_fkey" FOREIGN KEY ("parceiroId", "lojaId", "conexaoId")
    REFERENCES "IntegracaoConexao"("parceiroId", "lojaId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "IfoodEvento_tenant_key" ON "IntegracaoEventoIfood"("parceiroId", "id");
CREATE UNIQUE INDEX "IfoodEvento_evento_key" ON "IntegracaoEventoIfood"("parceiroId", "ambiente", "merchantId", "eventoId");

CREATE TABLE "IntegracaoEventoIfoodAck" (
  "id" TEXT PRIMARY KEY,
  "parceiroId" TEXT NOT NULL,
  "eventoInternoId" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "geracao" INTEGER NOT NULL DEFAULT 0,
  "recebidoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ackAceitoEm" TIMESTAMPTZ(3),
  "posse" TEXT,
  "posseAte" TIMESTAMPTZ(3),
  CONSTRAINT "IfoodEventoAck_parceiro_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "IfoodEventoAck_evento_fkey" FOREIGN KEY ("parceiroId", "eventoInternoId")
    REFERENCES "IntegracaoEventoIfood"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "IfoodEventoAck_geracao_valida" CHECK ("geracao" >= 0),
  CONSTRAINT "IfoodEventoAck_posse_consistente" CHECK (
    ("posse" IS NULL) = ("posseAte" IS NULL) AND ("ackAceitoEm" IS NULL OR "posse" IS NULL)
  )
);

CREATE UNIQUE INDEX "IfoodEventoAck_evento_app_key" ON "IntegracaoEventoIfoodAck"("parceiroId", "eventoInternoId", "appId");
CREATE INDEX "IfoodEventoAck_pendencias_idx" ON "IntegracaoEventoIfoodAck"("parceiroId", "appId", "ackAceitoEm", "recebidoEm");

-- O papel do tenant não lê ParceiroFlow. A função valida só o escopo da linha recebida.
CREATE FUNCTION erp_ifood_evento_confere() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
BEGIN
  IF NEW."parceiroId" IS DISTINCT FROM NULLIF(current_setting('app.parceiro_id', true), '') THEN
    RAISE EXCEPTION 'erp_ifood_evento_escopo_invalido' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
    FROM "ParceiroFlow" p
    JOIN "Loja" l ON l."parceiroId" = p."id" AND l."id" = NEW."lojaId"
    JOIN "IntegracaoConexao" c ON c."parceiroId" = l."parceiroId" AND c."lojaId" = l."id"
    WHERE p."id" = NEW."parceiroId" AND p."status" = 'ATIVO'
      AND p."homologacaoDeIntegracao" = (NEW."ambiente" = 'TEST') AND l."ativa"
      AND c."id" = NEW."conexaoId" AND c."provedor" = 'IFOOD' AND c."estado" = 'ATIVA'
      AND c."ambiente" = NEW."ambiente" AND c."idExterno" = NEW."merchantId"
    FOR SHARE OF p, l, c;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'erp_ifood_evento_escopo_invalido' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- O app global é consultado só para confirmar provedor e ambiente do evento.
CREATE FUNCTION erp_ifood_evento_ack_confere() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
BEGIN
  IF NEW."parceiroId" IS DISTINCT FROM NULLIF(current_setting('app.parceiro_id', true), '') THEN
    RAISE EXCEPTION 'erp_ifood_evento_ack_escopo_invalido' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
    FROM "IntegracaoEventoIfood" e
    JOIN "IntegracaoApp" a ON a."id" = NEW."appId" AND a."provedor" = 'IFOOD' AND a."ambiente" = e."ambiente"
    WHERE e."parceiroId" = NEW."parceiroId" AND e."id" = NEW."eventoInternoId"
    FOR SHARE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'erp_ifood_evento_ack_escopo_invalido' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION erp_ifood_evento_ack_identidade_imutavel() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF (NEW."id", NEW."parceiroId", NEW."eventoInternoId", NEW."appId", NEW."recebidoEm")
    IS DISTINCT FROM (OLD."id", OLD."parceiroId", OLD."eventoInternoId", OLD."appId", OLD."recebidoEm") THEN
    RAISE EXCEPTION 'erp_ifood_evento_ack_identidade_imutavel' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "IfoodEvento_confere" BEFORE INSERT ON "IntegracaoEventoIfood"
  FOR EACH ROW EXECUTE FUNCTION erp_ifood_evento_confere();
CREATE TRIGGER "IfoodEvento_imutavel" BEFORE UPDATE OR DELETE ON "IntegracaoEventoIfood"
  FOR EACH ROW EXECUTE FUNCTION erp_integracao_so_inclusao();
CREATE TRIGGER "IfoodEvento_sem_truncate" BEFORE TRUNCATE ON "IntegracaoEventoIfood"
  FOR EACH STATEMENT EXECUTE FUNCTION erp_integracao_so_inclusao();

CREATE TRIGGER "IfoodEventoAck_confere" BEFORE INSERT ON "IntegracaoEventoIfoodAck"
  FOR EACH ROW EXECUTE FUNCTION erp_ifood_evento_ack_confere();
CREATE TRIGGER "IfoodEventoAck_identidade_imutavel" BEFORE UPDATE ON "IntegracaoEventoIfoodAck"
  FOR EACH ROW EXECUTE FUNCTION erp_ifood_evento_ack_identidade_imutavel();
CREATE TRIGGER "IfoodEventoAck_imutavel" BEFORE DELETE ON "IntegracaoEventoIfoodAck"
  FOR EACH ROW EXECUTE FUNCTION erp_integracao_so_inclusao();
CREATE TRIGGER "IfoodEventoAck_sem_truncate" BEFORE TRUNCATE ON "IntegracaoEventoIfoodAck"
  FOR EACH STATEMENT EXECUTE FUNCTION erp_integracao_so_inclusao();

REVOKE ALL ON FUNCTION erp_ifood_evento_confere(), erp_ifood_evento_ack_confere(),
  erp_ifood_evento_ack_identidade_imutavel() FROM PUBLIC;

DO $$
DECLARE
  tabela text;
  tem_rls boolean := (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('"Loja"'));
  tem_papel boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant');
BEGIN
  IF tem_rls AND NOT tem_papel THEN
    RAISE EXCEPTION 'Events iFood: RLS exige erp_tenant existente';
  END IF;

  FOREACH tabela IN ARRAY ARRAY['IntegracaoEventoIfood', 'IntegracaoEventoIfoodAck'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', tabela);
    IF tem_papel THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM erp_tenant', tabela);
    END IF;
    IF tem_rls THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tabela);
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO erp_tenant '
        'USING ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), '''')) '
        'WITH CHECK ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), ''''))',
        tabela || '_do_parceiro', tabela
      );
      EXECUTE format('GRANT SELECT, INSERT ON TABLE %I TO erp_tenant', tabela);
    END IF;
  END LOOP;

  IF tem_papel THEN
    REVOKE ALL ON FUNCTION erp_ifood_evento_confere(), erp_ifood_evento_ack_confere(),
      erp_ifood_evento_ack_identidade_imutavel() FROM erp_tenant;
  END IF;
  IF tem_rls THEN
    GRANT UPDATE ("ackAceitoEm", "posse", "posseAte", "geracao") ON TABLE "IntegracaoEventoIfoodAck" TO erp_tenant;
  END IF;
END $$;

COMMIT;
