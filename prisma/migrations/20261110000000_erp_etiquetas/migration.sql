-- ERP 3.4 — Etiquetas: a emissão (o retrato imutável do que vai no papel), cada pedido de impressão, o lote do fornecedor no
-- recebimento e a abertura de uma embalagem com a validade efetiva. Decisões 400 a 429.
--
-- ADITIVA:
--  - três tabelas novas de tenant ("EtiquetaImpressao", "LoteDeInsumo", "AberturaDeLote"), com `parceiroId`, FKs compostas,
--    CHECKs de nascença (nascem vazias: nada antigo para violar), gatilhos e RLS + FORCE + política no padrão condicional da 0.2;
--  - "Etiqueta" (da 0.1, que nenhum código gravava) ganha colunas anuláveis e duas colunas deixam de ser obrigatórias
--    (`conservacao` e `validadeEm`: validade não informada é NULL, nunca uma data inventada). Os CHECKs novos dela entram
--    `NOT VALID` e são validados num bloco que AVISA em vez de quebrar (dado antigo de banco de prova); `npm run
--    erp:conferir-migracao` lista o que ficar pendente.
-- Nenhum passo lê tabela de tenant (lição da 2.1: o dono com FORCE RLS enxerga 0 linhas). Segura para superusuário e para dono
-- NÃO-superusuário, com ou sem RLS.
--
-- O banco é o cinto além da regra (`src/lib/erp/etiquetas.ts`):
--  - a abertura grava a validade EFETIVA = o MENOR entre abertura + prazo após abertura e o fim do dia do vencimento do lote (no
--    relógio do Rio); sem prazo, sem data; lote vencido não abre; o prazo é o do insumo na conservação escolhida, naquela hora;
--  - a emissão copia a validade do lote produzido (o retrato da conclusão da 3.1) ou da abertura, igual, e não muda depois;
--  - o pedido de impressão só muda uma vez: de PREPARADA para o resultado (enviada, arquivo gerado ou falhou).

-- ------------------------------------------------------------ tipos
CREATE TYPE "RegraDaValidade" AS ENUM ('LOTE_PRODUZIDO', 'LOTE_SEM_VALIDADE', 'PRAZO_APOS_ABERTURA', 'VENCIMENTO_DO_LOTE', 'PRAZO_NAO_INFORMADO');
CREATE TYPE "TransporteDaImpressao" AS ENUM ('BROWSER_PRINT', 'ARQUIVO_ZPL', 'PAPEL');
CREATE TYPE "SituacaoDaImpressao" AS ENUM ('PREPARADA', 'ENVIADA', 'EXPORTADA', 'FALHOU');
CREATE TYPE "OrigemDoLote" AS ENUM ('RECEBIMENTO', 'ABERTURA');

-- ------------------------------------------------------------ Etiqueta (da 0.1): a emissão
ALTER TABLE "Etiqueta" ALTER COLUMN "conservacao" DROP NOT NULL;
ALTER TABLE "Etiqueta" ALTER COLUMN "validadeEm" DROP NOT NULL;
ALTER TABLE "Etiqueta"
  ADD COLUMN "aberturaId" TEXT,
  ADD COLUMN "regraDaValidade" "RegraDaValidade",
  ADD COLUMN "validadeMinSnapshot" INTEGER,
  ADD COLUMN "vencimentoLoteEm" DATE,
  ADD COLUMN "loteProduzido" TEXT,
  ADD COLUMN "marcaSnapshot" TEXT,
  ADD COLUMN "lojaNomeSnapshot" TEXT,
  ADD COLUMN "quantas" INTEGER,
  ADD COLUMN "mostrarHora" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "versaoDoLayout" INTEGER,
  ADD COLUMN "responsavelUsuarioId" TEXT,
  ADD COLUMN "emitidaPorNome" TEXT,
  ADD COLUMN "emitidaPorUsuarioId" TEXT,
  ADD COLUMN "chaveEnvio" TEXT;

-- ------------------------------------------------------------ tabelas novas
CREATE TABLE "LoteDeInsumo" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "notaId" TEXT,
    "origem" "OrigemDoLote" NOT NULL,
    "insumoNomeSnapshot" TEXT NOT NULL,
    "unidadeSnapshot" "UnidadeBase" NOT NULL,
    "codigo" TEXT,
    "vencimentoEm" DATE,
    "fabricadoEm" DATE,
    "marca" TEXT,
    "sugeridoPeloXml" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorNome" TEXT NOT NULL,
    "criadoPorUsuarioId" TEXT,
    "chaveEnvio" TEXT,

    CONSTRAINT "LoteDeInsumo_pkey" PRIMARY KEY ("id"),
    -- Do recebimento = de uma nota; lido na abertura = sem nota.
    CONSTRAINT "LoteDeInsumo_origem_e_nota" CHECK (("origem" = 'RECEBIMENTO') = ("notaId" IS NOT NULL)),
    -- No recebimento, um lote sem código e sem vencimento não rastreia nada.
    CONSTRAINT "LoteDeInsumo_recebimento_diz_algo" CHECK ("origem" <> 'RECEBIMENTO' OR "codigo" IS NOT NULL OR "vencimentoEm" IS NOT NULL),
    CONSTRAINT "LoteDeInsumo_datas" CHECK (
      ("vencimentoEm" IS NULL OR "vencimentoEm" >= DATE '2000-01-01')
      AND ("fabricadoEm" IS NULL OR "fabricadoEm" >= DATE '2000-01-01')
      AND ("fabricadoEm" IS NULL OR "vencimentoEm" IS NULL OR "fabricadoEm" <= "vencimentoEm")
    ),
    CONSTRAINT "LoteDeInsumo_textos_curtos" CHECK (
      char_length("insumoNomeSnapshot") BETWEEN 1 AND 200
      AND ("codigo" IS NULL OR char_length("codigo") BETWEEN 1 AND 40)
      AND ("marca" IS NULL OR char_length("marca") BETWEEN 1 AND 80)
      AND char_length("criadoPorNome") BETWEEN 1 AND 120
      AND ("chaveEnvio" IS NULL OR char_length("chaveEnvio") BETWEEN 8 AND 64)
    )
);

CREATE TABLE "AberturaDeLote" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "loteId" TEXT,
    "insumoNomeSnapshot" TEXT NOT NULL,
    "unidadeSnapshot" "UnidadeBase" NOT NULL,
    "conservacao" "Conservacao" NOT NULL,
    "abertoEm" TIMESTAMP(3) NOT NULL,
    "prazoAposAberturaMin" INTEGER,
    "vencimentoLoteEm" DATE,
    "codigoLoteSnapshot" TEXT,
    "marcaSnapshot" TEXT,
    "validadeEm" TIMESTAMP(3),
    "regraDaValidade" "RegraDaValidade" NOT NULL,
    "quantidadeMilesimos" INTEGER,
    "abertoPorNome" TEXT NOT NULL,
    "abertoPorUsuarioId" TEXT,
    "chaveEnvio" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AberturaDeLote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AberturaDeLote_regra_da_abertura" CHECK ("regraDaValidade" IN ('PRAZO_APOS_ABERTURA', 'VENCIMENTO_DO_LOTE', 'PRAZO_NAO_INFORMADO')),
    CONSTRAINT "AberturaDeLote_prazo_faixa" CHECK ("prazoAposAberturaMin" IS NULL OR "prazoAposAberturaMin" BETWEEN 1 AND 1051200),
    -- Sem prazo após abertura = sem data (nunca inventada); com prazo, sempre com data.
    CONSTRAINT "AberturaDeLote_sem_prazo_sem_data" CHECK (
      ("prazoAposAberturaMin" IS NULL) = ("validadeEm" IS NULL)
      AND ("regraDaValidade" = 'PRAZO_NAO_INFORMADO') = ("prazoAposAberturaMin" IS NULL)
    ),
    -- A validade efetiva é o MENOR entre abertura + prazo e o fim do dia do vencimento do lote (Rio): abrir não prolonga.
    CONSTRAINT "AberturaDeLote_validade_efetiva" CHECK (
      "validadeEm" IS NULL OR "validadeEm" = LEAST(
        "abertoEm" + make_interval(mins => "prazoAposAberturaMin"),
        COALESCE((("vencimentoLoteEm" + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC', 'infinity'::timestamp)
      )
    ),
    CONSTRAINT "AberturaDeLote_regra_confere" CHECK (
      ("regraDaValidade" <> 'VENCIMENTO_DO_LOTE' OR ("vencimentoLoteEm" IS NOT NULL
        AND "validadeEm" = ((("vencimentoLoteEm" + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')))
      AND ("regraDaValidade" <> 'PRAZO_APOS_ABERTURA' OR "validadeEm" = "abertoEm" + make_interval(mins => "prazoAposAberturaMin"))
    ),
    -- Lote vencido não abre.
    CONSTRAINT "AberturaDeLote_lote_no_prazo" CHECK (
      "vencimentoLoteEm" IS NULL OR "abertoEm" < ((("vencimentoLoteEm" + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
    ),
    CONSTRAINT "AberturaDeLote_quantidade_faixa" CHECK ("quantidadeMilesimos" IS NULL OR "quantidadeMilesimos" BETWEEN 1 AND 10000000),
    CONSTRAINT "AberturaDeLote_textos_curtos" CHECK (
      char_length("insumoNomeSnapshot") BETWEEN 1 AND 200
      AND ("codigoLoteSnapshot" IS NULL OR char_length("codigoLoteSnapshot") BETWEEN 1 AND 40)
      AND ("marcaSnapshot" IS NULL OR char_length("marcaSnapshot") BETWEEN 1 AND 80)
      AND char_length("abertoPorNome") BETWEEN 1 AND 120
      AND ("chaveEnvio" IS NULL OR char_length("chaveEnvio") BETWEEN 8 AND 64)
    )
);

CREATE TABLE "EtiquetaImpressao" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "etiquetaId" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "copias" INTEGER NOT NULL,
    "transporte" "TransporteDaImpressao" NOT NULL,
    "situacao" "SituacaoDaImpressao" NOT NULL DEFAULT 'PREPARADA',
    "resolucao" INTEGER NOT NULL DEFAULT 203,
    "erro" TEXT,
    "solicitadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "solicitadaPorNome" TEXT NOT NULL,
    "solicitadaPorUsuarioId" TEXT,
    "concluidaEm" TIMESTAMP(3),
    "chaveEnvio" TEXT,
    "confirmadaEm" TIMESTAMP(3),
    "confirmadaPorNome" TEXT,
    "confirmadaPorUsuarioId" TEXT,

    CONSTRAINT "EtiquetaImpressao_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EtiquetaImpressao_faixas" CHECK ("sequencia" >= 1 AND "copias" BETWEEN 1 AND 50 AND "resolucao" IN (203, 300)),
    -- Preparada = ainda sem resultado; qualquer resultado tem a hora dele. Falhou diz o porquê.
    CONSTRAINT "EtiquetaImpressao_resultado" CHECK (
      ("situacao" = 'PREPARADA') = ("concluidaEm" IS NULL)
      AND ("situacao" <> 'FALHOU' OR "erro" IS NOT NULL)
      AND ("situacao" <> 'EXPORTADA' OR "transporte" <> 'BROWSER_PRINT')
      AND ("situacao" <> 'ENVIADA' OR "transporte" = 'BROWSER_PRINT')
      AND ("concluidaEm" IS NULL OR "concluidaEm" >= "solicitadaEm")
    ),
    -- "Já imprimi" (decisão 418): quem e quando, depois do pedido; só no que não teve a Zebra aceitando nem falhando.
    CONSTRAINT "EtiquetaImpressao_confirmacao" CHECK (
      ("confirmadaEm" IS NULL) = ("confirmadaPorNome" IS NULL)
      AND ("confirmadaEm" IS NULL OR ("confirmadaEm" >= "solicitadaEm" AND "situacao" IN ('EXPORTADA', 'PREPARADA')))
      AND ("confirmadaPorUsuarioId" IS NULL OR "confirmadaEm" IS NOT NULL)
    ),
    CONSTRAINT "EtiquetaImpressao_textos_curtos" CHECK (
      char_length("solicitadaPorNome") BETWEEN 1 AND 120
      AND ("erro" IS NULL OR char_length("erro") BETWEEN 1 AND 300)
      AND ("chaveEnvio" IS NULL OR char_length("chaveEnvio") BETWEEN 8 AND 64)
      AND ("confirmadaPorNome" IS NULL OR char_length("confirmadaPorNome") BETWEEN 1 AND 120)
    )
);

CREATE UNIQUE INDEX "LoteDeInsumo_parceiroId_id_key" ON "LoteDeInsumo"("parceiroId", "id");
CREATE UNIQUE INDEX "LoteDeInsumo_parceiroId_chaveEnvio_key" ON "LoteDeInsumo"("parceiroId", "chaveEnvio");
CREATE INDEX "LoteDeInsumo_parceiroId_lojaId_insumoId_idx" ON "LoteDeInsumo"("parceiroId", "lojaId", "insumoId");
CREATE INDEX "LoteDeInsumo_parceiroId_notaId_idx" ON "LoteDeInsumo"("parceiroId", "notaId");
CREATE UNIQUE INDEX "AberturaDeLote_parceiroId_id_key" ON "AberturaDeLote"("parceiroId", "id");
CREATE UNIQUE INDEX "AberturaDeLote_parceiroId_chaveEnvio_key" ON "AberturaDeLote"("parceiroId", "chaveEnvio");
CREATE INDEX "AberturaDeLote_parceiroId_lojaId_abertoEm_idx" ON "AberturaDeLote"("parceiroId", "lojaId", "abertoEm");
CREATE INDEX "AberturaDeLote_parceiroId_loteId_idx" ON "AberturaDeLote"("parceiroId", "loteId");
CREATE UNIQUE INDEX "EtiquetaImpressao_parceiroId_id_key" ON "EtiquetaImpressao"("parceiroId", "id");
CREATE UNIQUE INDEX "EtiquetaImpressao_parceiroId_etiquetaId_sequencia_key" ON "EtiquetaImpressao"("parceiroId", "etiquetaId", "sequencia");
CREATE UNIQUE INDEX "EtiquetaImpressao_parceiroId_chaveEnvio_key" ON "EtiquetaImpressao"("parceiroId", "chaveEnvio");
CREATE INDEX "EtiquetaImpressao_parceiroId_lojaId_solicitadaEm_idx" ON "EtiquetaImpressao"("parceiroId", "lojaId", "solicitadaEm");
-- Etiqueta: a chave nula repete à vontade (as linhas antigas), então o índice único não falha com dado antigo.
CREATE UNIQUE INDEX "Etiqueta_parceiroId_chaveEnvio_key" ON "Etiqueta"("parceiroId", "chaveEnvio");
CREATE INDEX "Etiqueta_parceiroId_aberturaId_idx" ON "Etiqueta"("parceiroId", "aberturaId");
CREATE INDEX "Etiqueta_parceiroId_lojaId_impressaEm_idx" ON "Etiqueta"("parceiroId", "lojaId", "impressaEm");

ALTER TABLE "LoteDeInsumo" ADD CONSTRAINT "LoteDeInsumo_parceiroId_fkey"
  FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LoteDeInsumo" ADD CONSTRAINT "LoteDeInsumo_parceiroId_lojaId_fkey"
  FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LoteDeInsumo" ADD CONSTRAINT "LoteDeInsumo_parceiroId_insumoId_fkey"
  FOREIGN KEY ("parceiroId", "insumoId") REFERENCES "Insumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LoteDeInsumo" ADD CONSTRAINT "LoteDeInsumo_parceiroId_notaId_fkey"
  FOREIGN KEY ("parceiroId", "notaId") REFERENCES "NotaEntrada"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AberturaDeLote" ADD CONSTRAINT "AberturaDeLote_parceiroId_fkey"
  FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AberturaDeLote" ADD CONSTRAINT "AberturaDeLote_parceiroId_lojaId_fkey"
  FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AberturaDeLote" ADD CONSTRAINT "AberturaDeLote_parceiroId_insumoId_fkey"
  FOREIGN KEY ("parceiroId", "insumoId") REFERENCES "Insumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AberturaDeLote" ADD CONSTRAINT "AberturaDeLote_parceiroId_loteId_fkey"
  FOREIGN KEY ("parceiroId", "loteId") REFERENCES "LoteDeInsumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EtiquetaImpressao" ADD CONSTRAINT "EtiquetaImpressao_parceiroId_fkey"
  FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EtiquetaImpressao" ADD CONSTRAINT "EtiquetaImpressao_parceiroId_lojaId_fkey"
  FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EtiquetaImpressao" ADD CONSTRAINT "EtiquetaImpressao_parceiroId_etiquetaId_fkey"
  FOREIGN KEY ("parceiroId", "etiquetaId") REFERENCES "Etiqueta"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Etiqueta" ADD CONSTRAINT "Etiqueta_parceiroId_aberturaId_fkey"
  FOREIGN KEY ("parceiroId", "aberturaId") REFERENCES "AberturaDeLote"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------ CHECKs novos na Etiqueta (tolerantes a dado antigo)
-- As linhas da 3.4 têm `regraDaValidade`; as antigas (sem ela) só precisam dos textos curtos.
ALTER TABLE "Etiqueta" ADD CONSTRAINT "Etiqueta_origem_da_emissao" CHECK (
  "regraDaValidade" IS NULL OR (
    num_nonnulls("ordemProducaoId", "aberturaId") = 1
    AND ("ordemProducaoId" IS NOT NULL) = ("regraDaValidade" IN ('LOTE_PRODUZIDO', 'LOTE_SEM_VALIDADE'))
    AND "chaveEnvio" IS NOT NULL AND "quantas" IS NOT NULL AND "lojaNomeSnapshot" IS NOT NULL AND "emitidaPorNome" IS NOT NULL
  )
) NOT VALID;
ALTER TABLE "Etiqueta" ADD CONSTRAINT "Etiqueta_validade_nunca_inventada" CHECK (
  "regraDaValidade" IS NULL OR (("regraDaValidade" IN ('LOTE_SEM_VALIDADE', 'PRAZO_NAO_INFORMADO')) = ("validadeEm" IS NULL))
) NOT VALID;
ALTER TABLE "Etiqueta" ADD CONSTRAINT "Etiqueta_quantas_faixa" CHECK ("quantas" IS NULL OR "quantas" BETWEEN 1 AND 50) NOT VALID;
ALTER TABLE "Etiqueta" ADD CONSTRAINT "Etiqueta_textos_curtos" CHECK (
  char_length("codigo") BETWEEN 1 AND 40
  AND char_length("nomeSnapshot") BETWEEN 1 AND 200
  AND ("loteFornecedor" IS NULL OR char_length("loteFornecedor") <= 40)
  AND ("loteProduzido" IS NULL OR char_length("loteProduzido") <= 20)
  AND ("marcaSnapshot" IS NULL OR char_length("marcaSnapshot") <= 80)
  AND ("lojaNomeSnapshot" IS NULL OR char_length("lojaNomeSnapshot") <= 120)
  AND ("responsavelNomeSnapshot" IS NULL OR char_length("responsavelNomeSnapshot") <= 120)
  AND ("emitidaPorNome" IS NULL OR char_length("emitidaPorNome") <= 120)
  AND ("chaveEnvio" IS NULL OR char_length("chaveEnvio") BETWEEN 8 AND 64)
) NOT VALID;

DO $$
DECLARE
  nome text;
BEGIN
  FOREACH nome IN ARRAY ARRAY['Etiqueta_origem_da_emissao', 'Etiqueta_validade_nunca_inventada', 'Etiqueta_quantas_faixa', 'Etiqueta_textos_curtos'] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE "Etiqueta" VALIDATE CONSTRAINT %I', nome);
    EXCEPTION WHEN check_violation THEN
      RAISE WARNING 'ERP 3.4: o CHECK % ficou NOT VALID (há etiqueta antiga que o viola). Corrija e rode ALTER TABLE "Etiqueta" VALIDATE CONSTRAINT "%";', nome, nome;
    END;
  END LOOP;
END $$;

-- ------------------------------------------------------------ gatilhos
CREATE TRIGGER "LoteDeInsumo_parceiro_imutavel" BEFORE UPDATE ON "LoteDeInsumo"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();
CREATE TRIGGER "AberturaDeLote_parceiro_imutavel" BEFORE UPDATE ON "AberturaDeLote"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();
CREATE TRIGGER "EtiquetaImpressao_parceiro_imutavel" BEFORE UPDATE ON "EtiquetaImpressao"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();

-- O lote do fornecedor: da loja e do insumo da nota (lançada) quando vem do recebimento; insumo comprado (pré-preparo segue a
-- ficha); não muda depois de registrado (corrigir = tirar e registrar de novo, se ninguém abriu).
CREATE OR REPLACE FUNCTION "erp_lote_de_insumo_confere"() RETURNS trigger AS $$
DECLARE
  n RECORD;
  tipo text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION '[erp] o lote do fornecedor não muda depois de registrado: tire e registre de novo (LoteDeInsumo_imutavel).' USING ERRCODE = 'check_violation';
  END IF;
  SELECT i."tipo"::text INTO tipo FROM "Insumo" i WHERE i."parceiroId" = NEW."parceiroId" AND i."id" = NEW."insumoId";
  IF tipo = 'PRE_PREPARO' THEN
    RAISE EXCEPTION '[erp] pré-preparo não tem lote de fornecedor: a validade dele vem do lote produzido (LoteDeInsumo_confere).' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."notaId" IS NOT NULL THEN
    SELECT x."lojaId", x."status"::text AS "status" INTO n FROM "NotaEntrada" x WHERE x."parceiroId" = NEW."parceiroId" AND x."id" = NEW."notaId";
    IF NOT FOUND OR n."lojaId" <> NEW."lojaId" OR n."status" <> 'LANCADA' THEN
      RAISE EXCEPTION '[erp] o lote do recebimento é de uma nota lançada da mesma loja (LoteDeInsumo_confere).' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "NotaEntradaItem" it WHERE it."parceiroId" = NEW."parceiroId" AND it."notaId" = NEW."notaId" AND it."insumoId" = NEW."insumoId") THEN
      RAISE EXCEPTION '[erp] o insumo do lote não está nesta nota (LoteDeInsumo_confere).' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LoteDeInsumo_confere" BEFORE INSERT OR UPDATE ON "LoteDeInsumo"
  FOR EACH ROW EXECUTE FUNCTION "erp_lote_de_insumo_confere"();

-- A abertura: o fato não muda; o lote é da mesma loja e do mesmo insumo, e o retrato dele é o que está no lote; o insumo é
-- comprado; o prazo é o do insumo na conservação escolhida, NAQUELA hora (nada inventado).
CREATE OR REPLACE FUNCTION "erp_abertura_de_lote_confere"() RETURNS trigger AS $$
DECLARE
  l RECORD;
  i RECORD;
  prazo integer;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION '[erp] a abertura registrada não muda nem some (AberturaDeLote_imutavel).' USING ERRCODE = 'check_violation';
  END IF;
  SELECT x."tipo"::text AS "tipo", x."validadeSecoMin", x."validadePistaFriaMin", x."validadeRefrigeradoMin", x."validadeCongeladoMin"
    INTO i FROM "Insumo" x WHERE x."parceiroId" = NEW."parceiroId" AND x."id" = NEW."insumoId";
  IF NOT FOUND OR i."tipo" = 'PRE_PREPARO' THEN
    RAISE EXCEPTION '[erp] só se abre embalagem de insumo comprado: o pré-preparo segue o lote produzido (AberturaDeLote_confere).' USING ERRCODE = 'check_violation';
  END IF;
  prazo := CASE NEW."conservacao"::text
    WHEN 'SECO' THEN i."validadeSecoMin"
    WHEN 'PISTA_FRIA' THEN i."validadePistaFriaMin"
    WHEN 'REFRIGERADO' THEN i."validadeRefrigeradoMin"
    WHEN 'CONGELADO' THEN i."validadeCongeladoMin"
  END;
  IF NEW."prazoAposAberturaMin" IS DISTINCT FROM prazo THEN
    RAISE EXCEPTION '[erp] o prazo da abertura é o prazo após abertura do insumo naquela conservação (AberturaDeLote_confere).' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."loteId" IS NOT NULL THEN
    SELECT x."lojaId", x."insumoId", x."vencimentoEm", x."codigo", x."marca" INTO l FROM "LoteDeInsumo" x WHERE x."parceiroId" = NEW."parceiroId" AND x."id" = NEW."loteId";
    IF NOT FOUND OR l."lojaId" <> NEW."lojaId" OR l."insumoId" <> NEW."insumoId"
       OR l."vencimentoEm" IS DISTINCT FROM NEW."vencimentoLoteEm" OR l."codigo" IS DISTINCT FROM NEW."codigoLoteSnapshot" OR l."marca" IS DISTINCT FROM NEW."marcaSnapshot" THEN
      RAISE EXCEPTION '[erp] a abertura é do lote da mesma loja e do mesmo insumo, com o vencimento dele (AberturaDeLote_confere).' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW."vencimentoLoteEm" IS NOT NULL OR NEW."codigoLoteSnapshot" IS NOT NULL OR NEW."marcaSnapshot" IS NOT NULL THEN
    RAISE EXCEPTION '[erp] sem lote, a abertura não tem vencimento, código nem marca (AberturaDeLote_confere).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AberturaDeLote_confere" BEFORE INSERT OR UPDATE OR DELETE ON "AberturaDeLote"
  FOR EACH ROW EXECUTE FUNCTION "erp_abertura_de_lote_confere"();

-- A emissão (só as linhas da 3.4, com `regraDaValidade`): copia a validade da origem (o lote concluído ou a abertura), na
-- mesma loja e no mesmo insumo; depois de criada não muda nem some.
CREATE OR REPLACE FUNCTION "erp_etiqueta_confere"() RETURNS trigger AS $$
DECLARE
  o RECORD;
  a RECORD;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD."regraDaValidade" IS NOT NULL THEN
    RAISE EXCEPTION '[erp] a etiqueta emitida não muda nem some: reimprimir usa o mesmo retrato (Etiqueta_imutavel).' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW."regraDaValidade" IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."ordemProducaoId" IS NOT NULL THEN
    SELECT x."lojaId", x."status"::text AS "status", x."produzidoMilesimos", x."insumoProduzidoId", x."validadeEm", x."conservacaoSnapshot"::text AS "conservacao", x."codigoLote",
           x."concluidaEm", x."responsavelNomeSnapshot", x."responsavelUsuarioId"
      INTO o FROM "OrdemProducao" x WHERE x."parceiroId" = NEW."parceiroId" AND x."id" = NEW."ordemProducaoId";
    -- Quem fez: o da conclusão, ou ninguém (quem pegou e não é da equipe não assina; decisão 401). Manipulação = conclusão.
    IF NOT FOUND OR o."status" <> 'CONCLUIDA' OR coalesce(o."produzidoMilesimos", 0) <= 0 OR o."lojaId" <> NEW."lojaId"
       OR o."insumoProduzidoId" IS DISTINCT FROM NEW."insumoId" OR o."validadeEm" IS DISTINCT FROM NEW."validadeEm"
       OR o."conservacao" IS DISTINCT FROM NEW."conservacao"::text OR o."codigoLote" IS DISTINCT FROM NEW."loteProduzido"
       OR (NEW."regraDaValidade" = 'LOTE_PRODUZIDO') <> (o."validadeEm" IS NOT NULL)
       OR o."concluidaEm" IS DISTINCT FROM NEW."fabricadoEm" OR NEW."abertoEm" IS NOT NULL OR NEW."aberturaId" IS NOT NULL
       OR (NEW."responsavelNomeSnapshot" IS NOT NULL AND NEW."responsavelNomeSnapshot" IS DISTINCT FROM o."responsavelNomeSnapshot")
       OR (NEW."responsavelUsuarioId" IS NOT NULL AND NEW."responsavelUsuarioId" IS DISTINCT FROM o."responsavelUsuarioId")
       OR (NEW."responsavelNomeSnapshot" IS NULL AND NEW."responsavelUsuarioId" IS NOT NULL)
       OR NEW."loteFornecedor" IS NOT NULL OR NEW."marcaSnapshot" IS NOT NULL OR NEW."vencimentoLoteEm" IS NOT NULL THEN
      RAISE EXCEPTION '[erp] a etiqueta do lote copia o lote concluído desta loja: a validade e a conservação dele (Etiqueta_origem_confere).' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT x."lojaId", x."insumoId", x."validadeEm", x."conservacao"::text AS "conservacao", x."regraDaValidade"::text AS "regra", x."vencimentoLoteEm", x."abertoEm",
           x."codigoLoteSnapshot", x."marcaSnapshot", x."abertoPorNome", x."abertoPorUsuarioId", x."quantidadeMilesimos"
      INTO a FROM "AberturaDeLote" x WHERE x."parceiroId" = NEW."parceiroId" AND x."id" = NEW."aberturaId";
    -- O lote do fornecedor, a marca, quem abriu e quanto são os da abertura (nada forjado na etiqueta).
    IF NOT FOUND OR a."lojaId" <> NEW."lojaId" OR a."insumoId" <> NEW."insumoId" OR a."validadeEm" IS DISTINCT FROM NEW."validadeEm"
       OR a."conservacao" IS DISTINCT FROM NEW."conservacao"::text OR a."regra" <> NEW."regraDaValidade"::text
       OR a."vencimentoLoteEm" IS DISTINCT FROM NEW."vencimentoLoteEm" OR a."abertoEm" IS DISTINCT FROM NEW."abertoEm"
       OR a."codigoLoteSnapshot" IS DISTINCT FROM NEW."loteFornecedor" OR a."marcaSnapshot" IS DISTINCT FROM NEW."marcaSnapshot"
       OR a."abertoPorNome" IS DISTINCT FROM NEW."responsavelNomeSnapshot" OR a."abertoPorUsuarioId" IS DISTINCT FROM NEW."responsavelUsuarioId"
       OR a."quantidadeMilesimos" IS DISTINCT FROM NEW."quantidadeMilesimos"
       OR NEW."fabricadoEm" IS NOT NULL OR NEW."loteProduzido" IS NOT NULL THEN
      RAISE EXCEPTION '[erp] a etiqueta do item aberto copia a abertura desta loja: a validade efetiva dela (Etiqueta_origem_confere).' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Etiqueta_origem_confere" BEFORE INSERT OR UPDATE OR DELETE ON "Etiqueta"
  FOR EACH ROW EXECUTE FUNCTION "erp_etiqueta_confere"();

-- O pedido de impressão: da loja da emissão; só a situação muda, uma vez, de PREPARADA para o resultado.
CREATE OR REPLACE FUNCTION "erp_etiqueta_impressao_confere"() RETURNS trigger AS $$
DECLARE
  loja text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '[erp] o pedido de impressão não some: é o histórico (EtiquetaImpressao_imutavel).' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT e."lojaId" INTO loja FROM "Etiqueta" e WHERE e."parceiroId" = NEW."parceiroId" AND e."id" = NEW."etiquetaId";
    IF loja IS DISTINCT FROM NEW."lojaId" THEN
      RAISE EXCEPTION '[erp] o pedido de impressão é da loja da etiqueta (EtiquetaImpressao_confere).' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."id" <> OLD."id"
     OR NEW."etiquetaId" <> OLD."etiquetaId" OR NEW."lojaId" <> OLD."lojaId" OR NEW."sequencia" <> OLD."sequencia" OR NEW."copias" <> OLD."copias"
     OR NEW."transporte" <> OLD."transporte" OR NEW."resolucao" <> OLD."resolucao" OR NEW."solicitadaEm" <> OLD."solicitadaEm"
     OR NEW."solicitadaPorNome" <> OLD."solicitadaPorNome" OR NEW."solicitadaPorUsuarioId" IS DISTINCT FROM OLD."solicitadaPorUsuarioId"
     OR NEW."chaveEnvio" IS DISTINCT FROM OLD."chaveEnvio" THEN
    RAISE EXCEPTION '[erp] o pedido de impressão só muda uma vez, de preparada para o resultado (EtiquetaImpressao_confere).' USING ERRCODE = 'check_violation';
  END IF;
  -- "Já imprimi" (decisão 418): uma vez, sem mexer no resultado.
  IF OLD."confirmadaEm" IS NULL AND NEW."confirmadaEm" IS NOT NULL THEN
    IF NEW."situacao" <> OLD."situacao" OR NEW."erro" IS DISTINCT FROM OLD."erro" OR NEW."concluidaEm" IS DISTINCT FROM OLD."concluidaEm" THEN
      RAISE EXCEPTION '[erp] confirmar a impressão não muda o resultado do pedido (EtiquetaImpressao_confere).' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."situacao" <> 'PREPARADA' OR OLD."confirmadaEm" IS NOT NULL
     OR NEW."confirmadaEm" IS DISTINCT FROM OLD."confirmadaEm" OR NEW."confirmadaPorNome" IS DISTINCT FROM OLD."confirmadaPorNome"
     OR NEW."confirmadaPorUsuarioId" IS DISTINCT FROM OLD."confirmadaPorUsuarioId" THEN
    RAISE EXCEPTION '[erp] o pedido de impressão só muda uma vez, de preparada para o resultado (EtiquetaImpressao_confere).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EtiquetaImpressao_confere" BEFORE INSERT OR UPDATE OR DELETE ON "EtiquetaImpressao"
  FOR EACH ROW EXECUTE FUNCTION "erp_etiqueta_impressao_confere"();

-- ------------------------------------------------------------ RLS
-- O mesmo padrão condicional da 0.2 e da 3.2 (só se quem roda pode instalar por inteiro). GRANT mínimo por tabela: o pedido
-- de impressão se lê, se cria e muda a situação (sem apagar); o lote se lê, se cria e se tira (o UPDATE existe só para as
-- travas de linha, FOR SHARE/FOR UPDATE, que o Postgres exige; o gatilho recusa qualquer mudança); a abertura só se lê e se
-- cria (é o fato).
DO $$
DECLARE
  tabela text;
  direitos text;
  ja_tem_rls boolean;
  eu record;
  dono boolean;
  pode_assumir boolean;
BEGIN
  SELECT coalesce(relrowsecurity, false) INTO ja_tem_rls FROM pg_class WHERE oid = to_regclass('"Loja"');
  SELECT rolsuper, rolcreaterole INTO eu FROM pg_roles WHERE rolname = current_user;

  FOREACH tabela IN ARRAY ARRAY['EtiquetaImpressao', 'LoteDeInsumo', 'AberturaDeLote'] LOOP
    dono := pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = to_regclass(format('%I', tabela))), 'USAGE');
    IF NOT coalesce(dono, false) THEN
      IF ja_tem_rls THEN RAISE EXCEPTION 'ERP 3.4: % não é dono de "%": a RLS não pode ser instalada nela.', current_user, tabela; END IF;
      RAISE NOTICE 'ERP RLS NÃO instalada em %: % não é dono. O portão segue isolando sem o papel erp_tenant.', tabela, current_user;
      CONTINUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
      IF NOT (eu.rolsuper OR eu.rolcreaterole) THEN
        IF ja_tem_rls THEN RAISE EXCEPTION 'ERP 3.4: o papel erp_tenant não existe e % não pode criá-lo.', current_user; END IF;
        RAISE NOTICE 'ERP RLS NÃO instalada em %: % não pode criar o papel erp_tenant.', tabela, current_user;
        CONTINUE;
      END IF;
      CREATE ROLE erp_tenant NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
    END IF;

    pode_assumir := CASE WHEN current_setting('server_version_num')::int >= 160000
                         THEN pg_has_role(current_user, 'erp_tenant', 'SET')
                         ELSE pg_has_role(current_user, 'erp_tenant', 'MEMBER') END;
    IF NOT pode_assumir THEN
      BEGIN
        EXECUTE format('GRANT erp_tenant TO %I', current_user);
      EXCEPTION WHEN insufficient_privilege OR invalid_grant_operation THEN
        IF ja_tem_rls THEN RAISE EXCEPTION 'ERP 3.4: % não consegue assumir o papel erp_tenant.', current_user; END IF;
        RAISE NOTICE 'ERP RLS NÃO instalada em %: % não consegue assumir o papel erp_tenant.', tabela, current_user;
        CONTINUE;
      END;
    END IF;

    direitos := CASE tabela WHEN 'EtiquetaImpressao' THEN 'SELECT, INSERT, UPDATE' WHEN 'LoteDeInsumo' THEN 'SELECT, INSERT, UPDATE, DELETE' ELSE 'SELECT, INSERT' END;
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO erp_tenant', current_schema());
    EXECUTE format('GRANT %s ON %I TO erp_tenant', direitos, tabela);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tabela);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tabela || '_do_parceiro', tabela);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL TO erp_tenant '
      'USING ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), '''')) '
      'WITH CHECK ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), ''''))',
      tabela || '_do_parceiro', tabela
    );
    RAISE NOTICE 'ERP RLS instalada em %.', tabela;
  END LOOP;
END $$;
