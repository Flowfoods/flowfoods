-- ERP 3.1 — Produção do pré-preparo pela ficha: o lote entra no estoque, os insumos baixam pela requisição.
-- Decisões 190 a 201.
--
-- ADITIVA: colunas novas em "OrdemProducao" (desenhada na 0.1, sem uso até aqui), índices, CHECKs, dois gatilhos.
-- Nenhuma tabela nova: portão (`MODELOS_DE_TENANT`), RLS e GRANT ficam como estão (o GRANT é da tabela inteira, então
-- as colunas novas já valem para o papel `erp_tenant`).
--
-- Segura para superusuário e para dono NÃO-superusuário, com ou sem FORCE RLS. Lição da 2.1: nenhum passo lê tabela de
-- tenant (o dono com FORCE RLS enxerga 0 linhas). Onde há dado antigo possível, a migration TENTA a operação e apanha o erro:
--  - CHECK entra NOT VALID (vale para toda escrita nova) e logo se tenta o VALIDATE; linha antiga que viole não reprova a
--    migration, só deixa o CHECK NOT VALID e avisa (WARNING);
--  - o índice único (parceiro, requisição) é criado dentro de um bloco que apanha `unique_violation`: se duas ordens
--    antigas apontassem a mesma requisição, o índice não nasce e o aviso diz.
-- O WARNING só aparece no terminal de quem roda a migration (o log do deploy automático não mostra): depois do deploy,
-- `npm run erp:conferir-migracao` lista o que ficou pendente (os CHECKs, o índice e os dois gatilhos).

-- ------------------------------------------------------------ colunas
ALTER TABLE "OrdemProducao"
  ADD COLUMN "versao" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "unidadeSnapshot" "UnidadeBase",
  ADD COLUMN "chaveIdempotencia" TEXT,
  ADD COLUMN "planejadaPorNome" TEXT,
  ADD COLUMN "iniciadaPorNome" TEXT,
  ADD COLUMN "concluidaPorNome" TEXT,
  ADD COLUMN "canceladaPorNome" TEXT,
  ADD COLUMN "canceladaEm" TIMESTAMP(3),
  ADD COLUMN "motivoCancelamento" TEXT,
  ADD COLUMN "motivoRendimento" TEXT,
  ADD COLUMN "insumosSemPreco" INTEGER,
  ADD COLUMN "conservacaoSnapshot" "Conservacao",
  ADD COLUMN "validadeMinSnapshot" INTEGER,
  ADD COLUMN "validadeEm" TIMESTAMP(3),
  ADD COLUMN "responsavelUsuarioId" TEXT;

-- ------------------------------------------------------------ índices
-- Planejar duas vezes com o mesmo formulário devolve a mesma ordem (a chave nasce no formulário). Coluna nova: todas nulas.
CREATE UNIQUE INDEX "OrdemProducao_parceiroId_chaveIdempotencia_key" ON "OrdemProducao"("parceiroId", "chaveIdempotencia");
-- O quadro lê por loja e estado.
CREATE INDEX "OrdemProducao_parceiroId_lojaId_status_idx" ON "OrdemProducao"("parceiroId", "lojaId", "status");

-- Uma requisição serve a uma ordem só. Se dado antigo repetir a requisição, o índice não nasce e a migration avisa.
DO $$
BEGIN
  CREATE UNIQUE INDEX "OrdemProducao_parceiroId_requisicaoId_key" ON "OrdemProducao"("parceiroId", "requisicaoId");
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'ERP 3.1: o índice OrdemProducao_parceiroId_requisicaoId_key NÃO foi criado (duas ordens apontam a mesma requisição); corrija e rode o CREATE UNIQUE INDEX da migration.';
END $$;

-- ------------------------------------------------------------ CHECKs (NOT VALID)
-- Concluída tem resultado: quando, quanto saiu e quanto custou (o custo é o fechado pelas baixas reais).
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_concluida_tem_resultado"
  CHECK ("status" <> 'CONCLUIDA' OR ("concluidaEm" IS NOT NULL AND "produzidoMilesimos" IS NOT NULL AND "custoTotalCentavos" IS NOT NULL)) NOT VALID;
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_versao_naoneg"
  CHECK ("versao" >= 0) NOT VALID;
-- Cancelada (ou estornada: CANCELADA que guarda `concluidaEm`) tem data e motivo de 3 a 200 letras; e só ela.
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_cancelada_tem_motivo"
  CHECK (
    (("status" = 'CANCELADA') = ("canceladaEm" IS NOT NULL))
    AND ("status" <> 'CANCELADA' OR ("motivoCancelamento" IS NOT NULL AND char_length("motivoCancelamento") BETWEEN 3 AND 200))
  ) NOT VALID;
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_iniciada_tem_data"
  CHECK ("status" NOT IN ('EM_EXECUCAO', 'CONCLUIDA') OR "iniciadaEm" IS NOT NULL) NOT VALID;
-- 10 mil kg/L/un planejados; produzido até o dobro disso (a regra recusa antes com frase; o banco é o cinto).
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_quantidades_teto"
  CHECK ("planejadoMilesimos" <= 10000000 AND ("produzidoMilesimos" IS NULL OR "produzidoMilesimos" <= 20000000)) NOT VALID;
-- AAMMDD-NN: a data planejada e a sequência do dia (2 a 4 dígitos).
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_codigo_do_lote"
  CHECK ("codigoLote" ~ '^[0-9]{6}-[0-9]{2,4}$') NOT VALID;
-- Validade do lote: 1 minuto a 730 dias, com a conservação que a deu; vem aos pares.
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_validade_faixa"
  CHECK (
    ("validadeMinSnapshot" IS NULL OR "validadeMinSnapshot" BETWEEN 1 AND 1051200)
    AND (("validadeMinSnapshot" IS NULL) = ("validadeEm" IS NULL))
    AND ("validadeMinSnapshot" IS NULL OR "conservacaoSnapshot" IS NOT NULL)
  ) NOT VALID;
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_sem_preco_naoneg"
  CHECK ("insumosSemPreco" IS NULL OR "insumosSemPreco" >= 0) NOT VALID;
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_textos_curtos"
  CHECK (
    ("planejadaPorNome" IS NULL OR char_length("planejadaPorNome") <= 120)
    AND ("iniciadaPorNome" IS NULL OR char_length("iniciadaPorNome") <= 120)
    AND ("concluidaPorNome" IS NULL OR char_length("concluidaPorNome") <= 120)
    AND ("canceladaPorNome" IS NULL OR char_length("canceladaPorNome") <= 120)
    AND ("motivoRendimento" IS NULL OR char_length("motivoRendimento") BETWEEN 3 AND 200)
    AND ("chaveIdempotencia" IS NULL OR char_length("chaveIdempotencia") <= 200)
    AND ("responsavelUsuarioId" IS NULL OR char_length("responsavelUsuarioId") <= 120)
    AND ("observacao" IS NULL OR char_length("observacao") <= 280)
  ) NOT VALID;

-- Lote que entra no estoque aponta a ordem (o CHECK "um documento por movimento" da 1.6 já cobre o resto).
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_producao_entrada_tem_ordem"
  CHECK ("tipo" <> 'PRODUCAO_ENTRADA' OR "ordemProducaoId" IS NOT NULL) NOT VALID;

-- ------------------------------------------------------------ validar o que já existe
-- VALIDATE só LÊ a tabela (não passa pela RLS: vale igual para o dono não-superusuário). Linha antiga que violar não
-- reprova a migration: o CHECK fica NOT VALID e o aviso diz qual.
DO $$
DECLARE
  alvo text[];
BEGIN
  FOREACH alvo SLICE 1 IN ARRAY ARRAY[
    ARRAY['OrdemProducao', 'OrdemProducao_concluida_tem_resultado'],
    ARRAY['OrdemProducao', 'OrdemProducao_versao_naoneg'],
    ARRAY['OrdemProducao', 'OrdemProducao_cancelada_tem_motivo'],
    ARRAY['OrdemProducao', 'OrdemProducao_iniciada_tem_data'],
    ARRAY['OrdemProducao', 'OrdemProducao_quantidades_teto'],
    ARRAY['OrdemProducao', 'OrdemProducao_codigo_do_lote'],
    ARRAY['OrdemProducao', 'OrdemProducao_validade_faixa'],
    ARRAY['OrdemProducao', 'OrdemProducao_sem_preco_naoneg'],
    ARRAY['OrdemProducao', 'OrdemProducao_textos_curtos'],
    ARRAY['MovimentoEstoque', 'MovimentoEstoque_producao_entrada_tem_ordem']
  ] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', alvo[1], alvo[2]);
    EXCEPTION WHEN check_violation THEN
      RAISE WARNING 'ERP 3.1: o CHECK % ficou NOT VALID (linha antiga em %, corrija e rode VALIDATE CONSTRAINT); vale para toda escrita nova.', alvo[2], alvo[1];
    END;
  END LOOP;
END $$;

-- ------------------------------------------------------------ gatilhos
-- O lote concluído não muda: o resultado (produzido, custo, lote, validade, quem concluiu) é fotografia. A única escrita que
-- passa é o ESTORNO: CONCLUIDA → CANCELADA, com data, quem e motivo (mais a versão). A cancelada não muda mais.
CREATE OR REPLACE FUNCTION "erp_ordem_producao_concluida_imutavel"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'CANCELADA' THEN
    RAISE EXCEPTION '[erp] o lote cancelado não muda mais (OrdemProducao_concluida_imutavel).' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" = 'CONCLUIDA' THEN
    IF NEW."status" NOT IN ('CONCLUIDA', 'CANCELADA') THEN
      RAISE EXCEPTION '[erp] o lote concluído só pode ser estornado (CANCELADA) (OrdemProducao_concluida_imutavel).' USING ERRCODE = 'check_violation';
    END IF;
    IF (to_jsonb(NEW) - 'status' - 'versao' - 'canceladaEm' - 'canceladaPorNome' - 'motivoCancelamento')
       IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'versao' - 'canceladaEm' - 'canceladaPorNome' - 'motivoCancelamento') THEN
      RAISE EXCEPTION '[erp] o resultado do lote concluído não muda: produzido, custo, lote e validade ficam como foram (OrdemProducao_concluida_imutavel).' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OrdemProducao_concluida_imutavel" BEFORE UPDATE ON "OrdemProducao"
  FOR EACH ROW EXECUTE FUNCTION "erp_ordem_producao_concluida_imutavel"();

-- A entrada do lote cai no insumo que a ficha produz, na MESMA loja da ordem (o estorno tem o espelho dele, conferido pelo
-- gatilho da 1.6). Conferido no banco: até SQL cru dentro do contexto passa por aqui. Debaixo do papel `erp_tenant` a
-- leitura da ordem já é do mesmo parceiro (RLS).
CREATE OR REPLACE FUNCTION "erp_producao_entrada_confere"() RETURNS trigger AS $$
DECLARE
  o RECORD;
BEGIN
  IF NEW."tipo" <> 'PRODUCAO_ENTRADA' OR NEW."estornoDeId" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT "lojaId", "insumoProduzidoId" INTO o FROM "OrdemProducao"
    WHERE "parceiroId" = NEW."parceiroId" AND "id" = NEW."ordemProducaoId";
  IF NOT FOUND OR o."lojaId" <> NEW."lojaId" OR o."insumoProduzidoId" IS DISTINCT FROM NEW."insumoId" THEN
    RAISE EXCEPTION '[erp] o lote entra no insumo que a ficha produz, na loja da ordem (MovimentoEstoque_producao_confere).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MovimentoEstoque_producao_confere" BEFORE INSERT ON "MovimentoEstoque"
  FOR EACH ROW EXECUTE FUNCTION "erp_producao_entrada_confere"();
