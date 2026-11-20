-- Preparação interna INATIVA; não cria app, conexão, grant de módulo ou permissão de pessoa.
DO $$ BEGIN EXECUTE format('SET search_path = %I, pg_temp', current_schema()); END $$;
CREATE TABLE "ReviewPolitica" (
  "id" TEXT PRIMARY KEY, "parceiroId" TEXT NOT NULL, "alvo" TEXT NOT NULL,
  "lojaId" TEXT, "versaoAtual" INTEGER NOT NULL, "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewPolitica_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReviewPolitica_parceiroId_lojaId_fkey" FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReviewPolitica_alvo_check" CHECK (("lojaId" IS NULL AND "alvo" = 'PARCEIRO') OR ("lojaId" IS NOT NULL AND "alvo" = 'LOJA:' || "lojaId")),
  CONSTRAINT "ReviewPolitica_versao_check" CHECK ("versaoAtual" > 0)
);
CREATE UNIQUE INDEX "ReviewPolitica_parceiroId_id_key" ON "ReviewPolitica"("parceiroId", "id");
CREATE UNIQUE INDEX "ReviewPolitica_parceiroId_alvo_key" ON "ReviewPolitica"("parceiroId", "alvo");

-- Limites editoriais/de armazenamento locais, sem alegar limite confirmado do canal.
CREATE FUNCTION erp_review_politica_tem_texto(valor text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path FROM CURRENT AS $$
  SELECT valor IS NOT NULL AND btrim(valor, E' \t\n\r\f' || U&'\000B\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') <> ''
$$;
CREATE FUNCTION erp_review_politica_lista_valida(itens text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path FROM CURRENT AS $$
  SELECT itens IS NOT NULL AND coalesce(array_ndims(itens), 1) = 1 AND cardinality(itens) <= 20 AND NOT EXISTS (
    SELECT 1 FROM unnest(itens) item WHERE NOT erp_review_politica_tem_texto(item) OR char_length(item) > 5000
  )
$$;
CREATE TABLE "ReviewPoliticaVersao" (
  "id" TEXT PRIMARY KEY, "parceiroId" TEXT NOT NULL, "politicaId" TEXT NOT NULL,
  "numero" INTEGER NOT NULL, "tom" TEXT NOT NULL, "assinatura" TEXT NOT NULL,
  "exemplos" TEXT[] NOT NULL, "restricoes" TEXT[] NOT NULL, "limiteEditorial" INTEGER NOT NULL,
  "autorUserId" TEXT NOT NULL, "autorNome" TEXT NOT NULL, "motivo" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewPoliticaVersao_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReviewPoliticaVersao_parceiroId_politicaId_fkey" FOREIGN KEY ("parceiroId", "politicaId") REFERENCES "ReviewPolitica"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReviewPoliticaVersao_conteudo_check" CHECK (
    "numero" > 0 AND erp_review_politica_tem_texto("tom") AND char_length("tom") <= 2000 AND char_length("assinatura") <= 2000
    AND erp_review_politica_lista_valida("exemplos") AND erp_review_politica_lista_valida("restricoes")
    AND "limiteEditorial" BETWEEN 1 AND 10000 AND erp_review_politica_tem_texto("autorUserId") AND erp_review_politica_tem_texto("autorNome")
    AND erp_review_politica_tem_texto("motivo") AND char_length("motivo") <= 2000
  )
);
CREATE UNIQUE INDEX "ReviewPoliticaVersao_parceiroId_id_key" ON "ReviewPoliticaVersao"("parceiroId", "id");
CREATE UNIQUE INDEX "ReviewPoliticaVersao_parceiroId_politicaId_numero_key" ON "ReviewPoliticaVersao"("parceiroId", "politicaId", "numero");

CREATE FUNCTION erp_review_politica_cabecalho() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."versaoAtual" <> 1 THEN RAISE EXCEPTION 'review_politica: primeira versão deve ser 1'; END IF;
  ELSIF (NEW.id, NEW."parceiroId", NEW.alvo, NEW."lojaId", NEW."criadoEm") IS DISTINCT FROM
        (OLD.id, OLD."parceiroId", OLD.alvo, OLD."lojaId", OLD."criadoEm") OR NEW."versaoAtual" <> OLD."versaoAtual" + 1 THEN
    RAISE EXCEPTION 'review_politica: identidade imutável; versão avança exatamente uma vez';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION erp_review_politica_versao_confere() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE atual integer;
BEGIN
  SELECT "versaoAtual" INTO atual FROM "ReviewPolitica"
    WHERE "parceiroId" = NEW."parceiroId" AND id = NEW."politicaId" FOR UPDATE;
  IF atual IS NULL OR atual <> NEW.numero THEN RAISE EXCEPTION 'review_politica: versão fora do cabeçalho do parceiro'; END IF;
  RETURN NEW;
END $$;

-- Não pode confirmar ponteiro sem a versão, nem criar lacunas no histórico (inclusive via SQL).
CREATE FUNCTION erp_review_politica_completa() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE atual integer; quantidade bigint; ultima integer;
BEGIN
  SELECT "versaoAtual" INTO atual FROM "ReviewPolitica" WHERE "parceiroId" = NEW."parceiroId" AND id = NEW.id;
  SELECT count(*), max(numero) INTO quantidade, ultima FROM "ReviewPoliticaVersao"
    WHERE "parceiroId" = NEW."parceiroId" AND "politicaId" = NEW.id;
  IF quantidade <> atual OR ultima IS DISTINCT FROM atual THEN RAISE EXCEPTION 'review_politica: histórico incompleto'; END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER "ReviewPolitica_cabecalho" BEFORE INSERT OR UPDATE ON "ReviewPolitica" FOR EACH ROW EXECUTE FUNCTION erp_review_politica_cabecalho();
CREATE CONSTRAINT TRIGGER "ReviewPolitica_completa" AFTER INSERT OR UPDATE ON "ReviewPolitica" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_review_politica_completa();
CREATE TRIGGER "ReviewPolitica_nao_apaga" BEFORE DELETE ON "ReviewPolitica" FOR EACH ROW EXECUTE FUNCTION erp_integracao_so_inclusao();
CREATE TRIGGER "ReviewPolitica_sem_truncate" BEFORE TRUNCATE ON "ReviewPolitica" FOR EACH STATEMENT EXECUTE FUNCTION erp_integracao_so_inclusao();
CREATE TRIGGER "ReviewPoliticaVersao_confere" BEFORE INSERT ON "ReviewPoliticaVersao" FOR EACH ROW EXECUTE FUNCTION erp_review_politica_versao_confere();
CREATE TRIGGER "ReviewPoliticaVersao_imutavel" BEFORE UPDATE OR DELETE ON "ReviewPoliticaVersao" FOR EACH ROW EXECUTE FUNCTION erp_integracao_so_inclusao();
CREATE TRIGGER "ReviewPoliticaVersao_sem_truncate" BEFORE TRUNCATE ON "ReviewPoliticaVersao" FOR EACH STATEMENT EXECUTE FUNCTION erp_integracao_so_inclusao();

-- Segue o perfil instalado, sem criar papéis nem ampliar permissões funcionais.
DO $$ DECLARE tem_rls boolean; tabela text; BEGIN
  SELECT coalesce(relrowsecurity, false) INTO tem_rls FROM pg_class WHERE oid = to_regclass('"Loja"');
  FOREACH tabela IN ARRAY ARRAY['ReviewPolitica','ReviewPoliticaVersao'] LOOP
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', tabela);
    IF tem_rls THEN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN RAISE EXCEPTION 'Review: RLS exige erp_tenant existente'; END IF;
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tabela);
      EXECUTE format('CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL TO erp_tenant USING ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), '''')) WITH CHECK ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), ''''))', tabela || '_do_parceiro', tabela);
      EXECUTE format('GRANT SELECT, INSERT ON %I TO erp_tenant', tabela);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON %I FROM erp_tenant', tabela);
    END IF;
  END LOOP;
  IF tem_rls THEN GRANT UPDATE ("versaoAtual") ON "ReviewPolitica" TO erp_tenant; END IF;
END $$;
RESET search_path;
