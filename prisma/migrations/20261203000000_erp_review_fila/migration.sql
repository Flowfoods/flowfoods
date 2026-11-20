-- Fila editorial LOCAL_SIMULATION / INATIVA. Nenhuma capacidade operacional é criada.
DO $$ BEGIN EXECUTE format('SET search_path = %I, pg_temp', current_schema()); END $$;
CREATE UNIQUE INDEX "HistoricoAlteracao_parceiroId_id_key" ON "HistoricoAlteracao"("parceiroId",id);
CREATE TABLE "ReviewSugestao" (
 id TEXT PRIMARY KEY, "parceiroId" TEXT NOT NULL, "lojaId" TEXT NOT NULL, "avaliacaoLocalId" TEXT NOT NULL,
 origem TEXT NOT NULL, capacidade TEXT NOT NULL, estado TEXT NOT NULL, "revisaoAtual" INTEGER NOT NULL,
 "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("parceiroId","lojaId") REFERENCES "Loja"("parceiroId",id) ON DELETE RESTRICT ON UPDATE CASCADE,
 CHECK (origem='LOCAL_SIMULATION' AND capacidade='INATIVA' AND estado IN ('RASCUNHO','APROVADA') AND "revisaoAtual">0),
 CHECK (erp_review_politica_tem_texto("avaliacaoLocalId") AND char_length("avaliacaoLocalId")<=200)
);
CREATE UNIQUE INDEX "ReviewSugestao_parceiroId_id_key" ON "ReviewSugestao"("parceiroId",id);
CREATE UNIQUE INDEX "ReviewSugestao_parceiroId_lojaId_avaliacaoLocalId_key" ON "ReviewSugestao"("parceiroId","lojaId","avaliacaoLocalId");
CREATE INDEX "ReviewSugestao_parceiroId_lojaId_estado_id_idx" ON "ReviewSugestao"("parceiroId","lojaId",estado,id);
CREATE TABLE "ReviewSugestaoRevisao" (
 id TEXT PRIMARY KEY, "parceiroId" TEXT NOT NULL, "sugestaoId" TEXT NOT NULL, numero INTEGER NOT NULL,
 "fatosVersao" TEXT NOT NULL, "fatosComentario" TEXT NOT NULL, texto TEXT NOT NULL, visibilidade TEXT NOT NULL,
 "politicaVersaoId" TEXT NOT NULL, "politicaSnapshot" JSONB NOT NULL, "editorUserId" TEXT NOT NULL, "editorNome" TEXT NOT NULL,
 motivo TEXT NOT NULL, "historicoId" TEXT NOT NULL, "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("parceiroId","sugestaoId") REFERENCES "ReviewSugestao"("parceiroId",id) ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("parceiroId","politicaVersaoId") REFERENCES "ReviewPoliticaVersao"("parceiroId",id) ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("parceiroId","historicoId") REFERENCES "HistoricoAlteracao"("parceiroId",id) ON DELETE RESTRICT ON UPDATE CASCADE,
 CHECK (numero>0 AND erp_review_politica_tem_texto("fatosVersao") AND char_length("fatosVersao")<=200
   AND char_length("fatosComentario")<=10000 AND erp_review_politica_tem_texto(texto) AND char_length(texto)<=10000
   AND visibilidade IN ('PUBLICA','PRIVADA') AND erp_review_politica_tem_texto("editorUserId") AND erp_review_politica_tem_texto("editorNome")
   AND erp_review_politica_tem_texto(motivo) AND char_length(motivo)<=2000)
);
CREATE UNIQUE INDEX "ReviewSugestaoRevisao_parceiroId_id_key" ON "ReviewSugestaoRevisao"("parceiroId",id);
CREATE UNIQUE INDEX "ReviewSugestaoRevisao_parceiroId_sugestaoId_numero_key" ON "ReviewSugestaoRevisao"("parceiroId","sugestaoId",numero);
CREATE UNIQUE INDEX "ReviewSugestaoRevisao_parceiroId_historicoId_key" ON "ReviewSugestaoRevisao"("parceiroId","historicoId");
CREATE INDEX "ReviewSugestaoRevisao_parceiroId_sugestaoId_fatosVersao_idx" ON "ReviewSugestaoRevisao"("parceiroId","sugestaoId","fatosVersao");
CREATE TABLE "ReviewSugestaoAprovacao" (
 id TEXT PRIMARY KEY, "parceiroId" TEXT NOT NULL, "sugestaoId" TEXT NOT NULL, revisao INTEGER NOT NULL,
 "aprovadorUserId" TEXT NOT NULL, "aprovadorNome" TEXT NOT NULL, motivo TEXT NOT NULL,
 "historicoId" TEXT NOT NULL, "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("parceiroId","sugestaoId") REFERENCES "ReviewSugestao"("parceiroId",id) ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("parceiroId","sugestaoId",revisao) REFERENCES "ReviewSugestaoRevisao"("parceiroId","sugestaoId",numero) ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("parceiroId","historicoId") REFERENCES "HistoricoAlteracao"("parceiroId",id) ON DELETE RESTRICT ON UPDATE CASCADE,
 CHECK (revisao>0 AND erp_review_politica_tem_texto("aprovadorUserId") AND erp_review_politica_tem_texto("aprovadorNome")
   AND erp_review_politica_tem_texto(motivo) AND char_length(motivo)<=2000)
);
CREATE UNIQUE INDEX "ReviewSugestaoAprovacao_parceiroId_id_key" ON "ReviewSugestaoAprovacao"("parceiroId",id);
CREATE UNIQUE INDEX "ReviewSugestaoAprovacao_parceiroId_sugestaoId_revisao_key" ON "ReviewSugestaoAprovacao"("parceiroId","sugestaoId",revisao);
CREATE UNIQUE INDEX "ReviewSugestaoAprovacao_parceiroId_historicoId_key" ON "ReviewSugestaoAprovacao"("parceiroId","historicoId");

CREATE FUNCTION erp_review_fila_cabecalho() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW."revisaoAtual"<>1 OR NEW.estado<>'RASCUNHO' THEN RAISE EXCEPTION 'review_fila: início inválido'; END IF;
 ELSE
   IF (NEW.id,NEW."parceiroId",NEW."lojaId",NEW."avaliacaoLocalId",NEW.origem,NEW.capacidade,NEW."criadoEm") IS DISTINCT FROM
      (OLD.id,OLD."parceiroId",OLD."lojaId",OLD."avaliacaoLocalId",OLD.origem,OLD.capacidade,OLD."criadoEm")
      OR NOT ((NEW."revisaoAtual"=OLD."revisaoAtual"+1 AND NEW.estado='RASCUNHO')
           OR (NEW."revisaoAtual"=OLD."revisaoAtual" AND OLD.estado='RASCUNHO' AND NEW.estado='APROVADA'))
   THEN RAISE EXCEPTION 'review_fila: identidade imutável ou transição inválida'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION erp_review_fila_completa() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE c "ReviewSugestao"%ROWTYPE; quantidade bigint; ultima integer; aprovadas bigint;
BEGIN
 SELECT * INTO c FROM "ReviewSugestao" WHERE "parceiroId"=NEW."parceiroId" AND id=NEW.id;
 SELECT count(*),max(numero) INTO quantidade,ultima FROM "ReviewSugestaoRevisao" WHERE "parceiroId"=c."parceiroId" AND "sugestaoId"=c.id;
 SELECT count(*) INTO aprovadas FROM "ReviewSugestaoAprovacao" WHERE "parceiroId"=c."parceiroId" AND "sugestaoId"=c.id AND revisao=c."revisaoAtual";
 IF quantidade<>c."revisaoAtual" OR ultima IS DISTINCT FROM c."revisaoAtual"
   OR (c.estado='APROVADA' AND aprovadas<>1) OR (c.estado='RASCUNHO' AND aprovadas<>0)
 THEN RAISE EXCEPTION 'review_fila: histórico ou aprovação incompleto'; END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION erp_review_fila_revisao_confere() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE c "ReviewSugestao"%ROWTYPE; p "ReviewPolitica"%ROWTYPE; v "ReviewPoliticaVersao"%ROWTYPE; h "HistoricoAlteracao"%ROWTYPE; esperado jsonb;
BEGIN
 SELECT * INTO c FROM "ReviewSugestao" WHERE "parceiroId"=NEW."parceiroId" AND id=NEW."sugestaoId" FOR UPDATE;
 IF c.id IS NULL OR c."revisaoAtual"<>NEW.numero OR c.estado<>'RASCUNHO' THEN RAISE EXCEPTION 'review_fila: revisão fora do cabeçalho'; END IF;
 IF EXISTS (SELECT 1 FROM "ReviewSugestaoRevisao" WHERE "parceiroId"=NEW."parceiroId" AND "sugestaoId"=NEW."sugestaoId"
   AND "fatosVersao"=NEW."fatosVersao" AND "fatosComentario"<>NEW."fatosComentario")
 THEN RAISE EXCEPTION 'review_fila: versão de fatos divergente'; END IF;
 SELECT * INTO p FROM "ReviewPolitica" WHERE "parceiroId"=NEW."parceiroId" AND ("lojaId"=c."lojaId" OR "lojaId" IS NULL)
   ORDER BY "lojaId" NULLS LAST LIMIT 1;
 SELECT * INTO v FROM "ReviewPoliticaVersao" WHERE "parceiroId"=NEW."parceiroId" AND id=NEW."politicaVersaoId"
   AND "politicaId"=p.id AND numero=p."versaoAtual";
 IF v.id IS NULL THEN RAISE EXCEPTION 'review_fila: política não corresponde à origem vigente'; END IF;
 esperado=jsonb_build_object('capacidade','INATIVA','parceiroId',NEW."parceiroId",'lojaConsultadaId',c."lojaId",
   'origem',CASE WHEN p."lojaId" IS NULL THEN 'PARCEIRO' ELSE 'LOJA' END,'lojaDaPoliticaId',p."lojaId",
   'politicaId',p.id,'versaoId',v.id,'numero',v.numero,
   'conteudo',jsonb_build_object('tom',v.tom,'assinatura',v.assinatura,'exemplos',v.exemplos,'restricoes',v.restricoes,'limiteEditorial',v."limiteEditorial"));
 IF NEW."politicaSnapshot" IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'review_fila: snapshot de política divergente'; END IF;
 SELECT * INTO h FROM "HistoricoAlteracao" WHERE "parceiroId"=NEW."parceiroId" AND id=NEW."historicoId";
 IF h.id IS NULL OR h.entidade<>'ReviewSugestao' OR h."entidadeId"<>c.id
   OR h.acao<>(CASE WHEN NEW.numero=1 THEN 'CRIOU' ELSE 'EDITOU' END)
   OR h."autorNome"<>NEW."editorNome" OR h.motivo IS DISTINCT FROM NEW.motivo
   OR h.depois IS DISTINCT FROM jsonb_build_object('revisaoId',NEW.id,'revisao',NEW.numero,'estado','RASCUNHO','origem','LOCAL_SIMULATION','capacidade','INATIVA','autorUserId',NEW."editorUserId")
 THEN RAISE EXCEPTION 'review_fila: auditoria da revisão incompatível'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION erp_review_fila_aprovacao_confere() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE c "ReviewSugestao"%ROWTYPE; h "HistoricoAlteracao"%ROWTYPE; r "ReviewSugestaoRevisao"%ROWTYPE;
BEGIN
 SELECT * INTO c FROM "ReviewSugestao" WHERE "parceiroId"=NEW."parceiroId" AND id=NEW."sugestaoId" FOR UPDATE;
 IF c.id IS NULL OR c."revisaoAtual"<>NEW.revisao OR c.estado<>'APROVADA' THEN RAISE EXCEPTION 'review_fila: aprovação fora da revisão corrente'; END IF;
 SELECT * INTO r FROM "ReviewSugestaoRevisao" WHERE "parceiroId"=NEW."parceiroId" AND "sugestaoId"=NEW."sugestaoId" AND numero=NEW.revisao;
 IF r.id IS NULL OR char_length(r.texto)>(r."politicaSnapshot"#>>'{conteudo,limiteEditorial}')::integer
 THEN RAISE EXCEPTION 'review_fila: limite editorial da revisão excedido'; END IF;
 SELECT * INTO h FROM "HistoricoAlteracao" WHERE "parceiroId"=NEW."parceiroId" AND id=NEW."historicoId";
 IF h.id IS NULL OR h.entidade<>'ReviewSugestao' OR h."entidadeId"<>c.id OR h.acao<>'APROVOU'
   OR h."autorNome"<>NEW."aprovadorNome" OR h.motivo IS DISTINCT FROM NEW.motivo
   OR h.depois IS DISTINCT FROM jsonb_build_object('revisao',NEW.revisao,'aprovacaoId',NEW.id,'estado','APROVADA','origem','LOCAL_SIMULATION','capacidade','INATIVA','autorUserId',NEW."aprovadorUserId")
 THEN RAISE EXCEPTION 'review_fila: auditoria da aprovação incompatível'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ReviewSugestao_cabecalho" BEFORE INSERT OR UPDATE ON "ReviewSugestao" FOR EACH ROW EXECUTE FUNCTION erp_review_fila_cabecalho();
CREATE CONSTRAINT TRIGGER "ReviewSugestao_completa" AFTER INSERT OR UPDATE ON "ReviewSugestao" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_review_fila_completa();
CREATE TRIGGER "ReviewSugestaoRevisao_confere" BEFORE INSERT ON "ReviewSugestaoRevisao" FOR EACH ROW EXECUTE FUNCTION erp_review_fila_revisao_confere();
CREATE TRIGGER "ReviewSugestaoAprovacao_confere" BEFORE INSERT ON "ReviewSugestaoAprovacao" FOR EACH ROW EXECUTE FUNCTION erp_review_fila_aprovacao_confere();
CREATE TRIGGER "ReviewSugestao_imutavel" BEFORE DELETE ON "ReviewSugestao" FOR EACH ROW EXECUTE FUNCTION erp_integracao_so_inclusao();
CREATE TRIGGER "ReviewSugestao_sem_truncate" BEFORE TRUNCATE ON "ReviewSugestao" FOR EACH STATEMENT EXECUTE FUNCTION erp_integracao_so_inclusao();
CREATE TRIGGER "ReviewSugestaoRevisao_imutavel" BEFORE UPDATE OR DELETE ON "ReviewSugestaoRevisao" FOR EACH ROW EXECUTE FUNCTION erp_integracao_so_inclusao();
CREATE TRIGGER "ReviewSugestaoRevisao_sem_truncate" BEFORE TRUNCATE ON "ReviewSugestaoRevisao" FOR EACH STATEMENT EXECUTE FUNCTION erp_integracao_so_inclusao();
CREATE TRIGGER "ReviewSugestaoAprovacao_imutavel" BEFORE UPDATE OR DELETE ON "ReviewSugestaoAprovacao" FOR EACH ROW EXECUTE FUNCTION erp_integracao_so_inclusao();
CREATE TRIGGER "ReviewSugestaoAprovacao_sem_truncate" BEFORE TRUNCATE ON "ReviewSugestaoAprovacao" FOR EACH STATEMENT EXECUTE FUNCTION erp_integracao_so_inclusao();

DO $$ DECLARE tem_rls boolean; tabela text; BEGIN
 SELECT coalesce(relrowsecurity,false) INTO tem_rls FROM pg_class WHERE oid=to_regclass('"Loja"');
 FOREACH tabela IN ARRAY ARRAY['ReviewSugestao','ReviewSugestaoRevisao','ReviewSugestaoAprovacao'] LOOP
   EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',tabela);
   IF tem_rls THEN
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='erp_tenant') THEN RAISE EXCEPTION 'Review fila: RLS exige erp_tenant existente'; END IF;
     EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tabela);
     EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tabela);
     EXECUTE format('CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL TO erp_tenant USING ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), '''')) WITH CHECK ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), ''''))',tabela || '_do_parceiro',tabela);
     EXECUTE format('GRANT SELECT, INSERT ON %I TO erp_tenant',tabela);
   END IF;
   IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='erp_tenant') THEN
     EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON %I FROM erp_tenant',tabela);
   END IF;
 END LOOP;
 IF tem_rls THEN GRANT UPDATE ("revisaoAtual",estado) ON "ReviewSugestao" TO erp_tenant; END IF;
END $$;
RESET search_path;
