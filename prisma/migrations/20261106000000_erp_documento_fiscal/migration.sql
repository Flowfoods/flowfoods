-- ERP F.1b — Notas fiscais por XML (NF-e recebida manualmente): o documento fiscal, os itens dele e a memória do fornecedor. Decisões 314 em diante.
--
-- ADITIVA: três tabelas novas de tenant ("DocumentoFiscal", "DocumentoFiscalItem", "VinculoItemFornecedor"), dois tipos e UMA troca de
-- índice em "NotaEntrada": o único TOTAL da chave de acesso vira único PARCIAL (só entre as notas que não estão canceladas), para que
-- cancelar a nota conciliada libere a chave e o mesmo documento se concilie de novo, sem nunca haver duas notas ativas com a mesma
-- chave. A coluna `chaveAcesso` nunca foi gravada antes desta fase (o índice novo nasce sem violar nada). Nenhuma linha antiga é lida,
-- movida ou apagada; nenhum fornecedor, nota ou insumo muda.
--
-- Segura para superusuário e para dono NÃO-superusuário, com ou sem FORCE RLS: nenhum passo lê tabela de tenant (as tabelas nascem
-- vazias, com os CHECKs validados de nascença). A troca do índice fica num bloco que captura a violação (não acontece, mas se
-- acontecesse o índice antigo ficaria no lugar e a migration avisaria). O bloco da RLS é o padrão condicional da 0.2: se as
-- tabelas antigas JÁ têm RLS e uma nova não puder ganhar, a migration para com a frase. Depois do deploy,
-- `npm run erp:conferir-migracao` confere as tabelas, a RLS, os índices, os gatilhos e os CHECKs.
--
-- O que o banco garante (além do portão): o CONTEÚDO do documento (chave, XML, emitente, destinatário, números e totais) é imutável; a
-- loja e o fornecedor só se resolvem uma vez (de nulo para um valor); a situação só anda por caminhos permitidos e o cancelado não
-- volta; o item só muda a resolução (insumo, embalagem, fator) enquanto o documento aguarda conferência; conciliado quer dizer que
-- tem nota, loja e fornecedor; o fator é de 0,001 a 1.000 embalagens por unidade comercial.

-- ------------------------------------------------------------ tipos
CREATE TYPE "SituacaoDocumentoFiscal" AS ENUM ('RECEBIDO', 'AGUARDANDO_CONFERENCIA', 'CONCILIADO', 'CANCELADO', 'ERRO');
CREATE TYPE "OrigemDocumentoFiscal" AS ENUM ('XML_MANUAL', 'SEFAZ');

-- ------------------------------------------------------------ tabelas
CREATE TABLE "DocumentoFiscal" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "chaveAcesso" TEXT NOT NULL,
    "modelo" INTEGER NOT NULL DEFAULT 55,
    "serie" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "emitidaEm" DATE NOT NULL,
    "emitenteDocumento" TEXT NOT NULL,
    "emitenteRazao" TEXT NOT NULL,
    "emitenteFantasia" TEXT,
    "emitenteIe" TEXT,
    "emitenteUf" TEXT,
    "emitenteMunicipio" TEXT,
    "emitenteEndereco" TEXT,
    "emitenteCep" TEXT,
    "destinatarioDocumento" TEXT NOT NULL,
    "lojaId" TEXT,
    "fornecedorId" TEXT,
    "vProdCentavos" INTEGER NOT NULL,
    "vDescCentavos" INTEGER NOT NULL,
    "vFreteCentavos" INTEGER NOT NULL,
    "vSegCentavos" INTEGER NOT NULL,
    "vOutroCentavos" INTEGER NOT NULL,
    "vIpiCentavos" INTEGER NOT NULL,
    "vStCentavos" INTEGER NOT NULL,
    "vNfCentavos" INTEGER NOT NULL,
    "duplicatas" JSONB,
    "situacao" "SituacaoDocumentoFiscal" NOT NULL DEFAULT 'AGUARDANDO_CONFERENCIA',
    "origem" "OrigemDocumentoFiscal" NOT NULL DEFAULT 'XML_MANUAL',
    "xmlSha256" TEXT NOT NULL,
    "xml" TEXT NOT NULL,
    "notaEntradaId" TEXT,
    "motivo" TEXT,
    "canceladoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorNome" TEXT NOT NULL DEFAULT '',
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoFiscal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DocumentoFiscal_chave_44" CHECK ("chaveAcesso" ~ '^[0-9]{44}$'),
    CONSTRAINT "DocumentoFiscal_modelo_55" CHECK ("modelo" = 55),
    CONSTRAINT "DocumentoFiscal_emitente_formato" CHECK ("emitenteDocumento" ~ '^([0-9]{11}|[0-9]{14})$'),
    CONSTRAINT "DocumentoFiscal_destinatario_formato" CHECK ("destinatarioDocumento" ~ '^[0-9]{14}$'),
    CONSTRAINT "DocumentoFiscal_uf_valida" CHECK ("emitenteUf" IS NULL OR "emitenteUf" IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
    CONSTRAINT "DocumentoFiscal_textos_curtos" CHECK (
      char_length("numero") BETWEEN 1 AND 20 AND char_length("serie") BETWEEN 1 AND 10
      AND char_length("emitenteRazao") BETWEEN 1 AND 200
      AND ("emitenteFantasia" IS NULL OR char_length("emitenteFantasia") BETWEEN 1 AND 200)
      AND ("emitenteEndereco" IS NULL OR char_length("emitenteEndereco") BETWEEN 1 AND 300)
      AND ("emitenteMunicipio" IS NULL OR char_length("emitenteMunicipio") BETWEEN 1 AND 100)
      AND ("emitenteIe" IS NULL OR "emitenteIe" ~ '^(ISENTO|[0-9]{2,14})$')
      AND ("emitenteCep" IS NULL OR "emitenteCep" ~ '^[0-9]{8}$')
    ),
    -- Dinheiro em centavos, nunca negativo e dentro do INTEGER (a mesma faixa das notas: R$ 20 milhões).
    CONSTRAINT "DocumentoFiscal_valores_faixa" CHECK (
      "vProdCentavos" BETWEEN 0 AND 2000000000 AND "vDescCentavos" BETWEEN 0 AND 2000000000 AND "vFreteCentavos" BETWEEN 0 AND 2000000000
      AND "vSegCentavos" BETWEEN 0 AND 2000000000 AND "vOutroCentavos" BETWEEN 0 AND 2000000000 AND "vIpiCentavos" BETWEEN 0 AND 2000000000
      AND "vStCentavos" BETWEEN 0 AND 2000000000 AND "vNfCentavos" BETWEEN 0 AND 2000000000
    ),
    CONSTRAINT "DocumentoFiscal_sha256_formato" CHECK ("xmlSha256" ~ '^[0-9a-f]{64}$'),
    -- 1 MiB: o servidor recusa acima de 1 000 000 bytes; o banco repete com folga.
    CONSTRAINT "DocumentoFiscal_xml_tamanho" CHECK (octet_length("xml") BETWEEN 1 AND 1048576),
    -- Conciliado QUER DIZER que tem nota de compra, loja e fornecedor; e só o conciliado tem nota.
    CONSTRAINT "DocumentoFiscal_conciliado_tem_nota" CHECK (("situacao" = 'CONCILIADO') = ("notaEntradaId" IS NOT NULL)),
    CONSTRAINT "DocumentoFiscal_conciliado_tem_loja_e_fornecedor" CHECK ("situacao" <> 'CONCILIADO' OR ("lojaId" IS NOT NULL AND "fornecedorId" IS NOT NULL)),
    CONSTRAINT "DocumentoFiscal_cancelado_tem_motivo" CHECK ("situacao" <> 'CANCELADO' OR ("canceladoEm" IS NOT NULL AND char_length(coalesce("motivo", '')) >= 3))
);

CREATE TABLE "DocumentoFiscalItem" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "nItem" INTEGER NOT NULL,
    "codigoProduto" TEXT NOT NULL,
    "gtin" TEXT,
    "descricao" TEXT NOT NULL,
    "ncm" TEXT,
    "cfop" TEXT,
    "unidadeComercial" TEXT NOT NULL,
    "qComTexto" TEXT NOT NULL,
    "qComMilesimos" INTEGER NOT NULL,
    "vProdCentavos" INTEGER NOT NULL,
    "vDescCentavos" INTEGER NOT NULL,
    "vOutroCentavos" INTEGER NOT NULL,
    "vSegCentavos" INTEGER NOT NULL,
    "vIpiCentavos" INTEGER NOT NULL,
    "vStCentavos" INTEGER NOT NULL,
    "vFreteCentavos" INTEGER NOT NULL,
    "liquidoCentavos" INTEGER NOT NULL,
    "insumoId" TEXT,
    "varianteId" TEXT,
    "aGranel" BOOLEAN NOT NULL DEFAULT false,
    "fatorMilesimos" INTEGER,
    "vinculoId" TEXT,

    CONSTRAINT "DocumentoFiscalItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DocumentoFiscalItem_nItem_faixa" CHECK ("nItem" BETWEEN 1 AND 990),
    CONSTRAINT "DocumentoFiscalItem_textos_curtos" CHECK (
      char_length("codigoProduto") BETWEEN 1 AND 60 AND char_length("descricao") BETWEEN 1 AND 120
      AND char_length("unidadeComercial") BETWEEN 1 AND 10 AND char_length("qComTexto") BETWEEN 1 AND 20
      AND ("gtin" IS NULL OR "gtin" ~ '^[0-9]{8}([0-9]{4,6})?$')
      AND ("ncm" IS NULL OR "ncm" ~ '^[0-9]{2}([0-9]{6})?$')
      AND ("cfop" IS NULL OR "cfop" ~ '^[0-9]{4}$')
    ),
    CONSTRAINT "DocumentoFiscalItem_quantidade_faixa" CHECK ("qComMilesimos" BETWEEN 1 AND 2000000000),
    CONSTRAINT "DocumentoFiscalItem_valores_faixa" CHECK (
      "vProdCentavos" BETWEEN 0 AND 2000000000 AND "vDescCentavos" BETWEEN 0 AND 2000000000 AND "vOutroCentavos" BETWEEN 0 AND 2000000000
      AND "vSegCentavos" BETWEEN 0 AND 2000000000 AND "vIpiCentavos" BETWEEN 0 AND 2000000000 AND "vStCentavos" BETWEEN 0 AND 2000000000
      AND "vFreteCentavos" BETWEEN 0 AND 2000000000 AND "liquidoCentavos" BETWEEN 0 AND 2000000000
    ),
    -- Resolvido por inteiro ou nada: insumo e fator vêm juntos; a granel não tem embalagem; a memória só aponta para item resolvido.
    CONSTRAINT "DocumentoFiscalItem_resolucao_inteira" CHECK (("insumoId" IS NULL) = ("fatorMilesimos" IS NULL)),
    CONSTRAINT "DocumentoFiscalItem_fator_faixa" CHECK ("fatorMilesimos" IS NULL OR "fatorMilesimos" BETWEEN 1 AND 1000000),
    CONSTRAINT "DocumentoFiscalItem_granel_sem_embalagem" CHECK (NOT "aGranel" OR "varianteId" IS NULL),
    CONSTRAINT "DocumentoFiscalItem_embalagem_precisa_insumo" CHECK ("varianteId" IS NULL OR "insumoId" IS NOT NULL),
    CONSTRAINT "DocumentoFiscalItem_vinculo_precisa_insumo" CHECK ("vinculoId" IS NULL OR "insumoId" IS NOT NULL)
);

CREATE TABLE "VinculoItemFornecedor" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "codigoProduto" TEXT NOT NULL,
    "unidadeComercial" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "varianteId" TEXT,
    "aGranel" BOOLEAN NOT NULL DEFAULT false,
    "fatorMilesimos" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoPorNome" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "VinculoItemFornecedor_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VinculoItemFornecedor_textos_curtos" CHECK (
      char_length("codigoProduto") BETWEEN 1 AND 60 AND char_length("unidadeComercial") BETWEEN 1 AND 10 AND char_length("atualizadoPorNome") <= 120
    ),
    CONSTRAINT "VinculoItemFornecedor_fator_faixa" CHECK ("fatorMilesimos" BETWEEN 1 AND 1000000),
    CONSTRAINT "VinculoItemFornecedor_granel_sem_embalagem" CHECK (NOT "aGranel" OR "varianteId" IS NULL)
);

-- ------------------------------------------------------------ índices
CREATE INDEX "DocumentoFiscal_parceiroId_situacao_emitidaEm_idx" ON "DocumentoFiscal"("parceiroId", "situacao", "emitidaEm" DESC);
CREATE INDEX "DocumentoFiscal_parceiroId_lojaId_idx" ON "DocumentoFiscal"("parceiroId", "lojaId");
CREATE INDEX "DocumentoFiscal_parceiroId_fornecedorId_idx" ON "DocumentoFiscal"("parceiroId", "fornecedorId");
CREATE INDEX "DocumentoFiscal_parceiroId_destinatarioDocumento_idx" ON "DocumentoFiscal"("parceiroId", "destinatarioDocumento");
CREATE UNIQUE INDEX "DocumentoFiscal_parceiroId_id_key" ON "DocumentoFiscal"("parceiroId", "id");
CREATE UNIQUE INDEX "DocumentoFiscal_parceiroId_chaveAcesso_key" ON "DocumentoFiscal"("parceiroId", "chaveAcesso");
CREATE UNIQUE INDEX "DocumentoFiscal_parceiroId_notaEntradaId_key" ON "DocumentoFiscal"("parceiroId", "notaEntradaId");
CREATE INDEX "DocumentoFiscalItem_parceiroId_insumoId_idx" ON "DocumentoFiscalItem"("parceiroId", "insumoId");
CREATE INDEX "DocumentoFiscalItem_parceiroId_vinculoId_idx" ON "DocumentoFiscalItem"("parceiroId", "vinculoId");
CREATE UNIQUE INDEX "DocumentoFiscalItem_parceiroId_id_key" ON "DocumentoFiscalItem"("parceiroId", "id");
CREATE UNIQUE INDEX "DocumentoFiscalItem_parceiroId_documentoId_nItem_key" ON "DocumentoFiscalItem"("parceiroId", "documentoId", "nItem");
CREATE INDEX "VinculoItemFornecedor_parceiroId_insumoId_idx" ON "VinculoItemFornecedor"("parceiroId", "insumoId");
CREATE UNIQUE INDEX "VinculoItemFornecedor_parceiroId_id_key" ON "VinculoItemFornecedor"("parceiroId", "id");
CREATE UNIQUE INDEX "VinculoItemFornecedor_parceiroId_fornecedorId_codigoProduto_key" ON "VinculoItemFornecedor"("parceiroId", "fornecedorId", "codigoProduto", "unidadeComercial");

-- A chave de acesso da NOTA: único total vira único parcial (só as que valem). Cria o novo e o comum ANTES de tirar o antigo.
CREATE INDEX "NotaEntrada_parceiroId_chaveAcesso_idx" ON "NotaEntrada"("parceiroId", "chaveAcesso");

DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX "NotaEntrada_chave_ativa_key" ON "NotaEntrada"("parceiroId", "chaveAcesso") WHERE "chaveAcesso" IS NOT NULL AND "status" <> 'CANCELADA';
    DROP INDEX "NotaEntrada_parceiroId_chaveAcesso_key";
  EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'ERP F.1b: o índice parcial NotaEntrada_chave_ativa_key NÃO foi criado (duas notas ativas com a mesma chave de acesso); o índice único antigo continua no lugar. Rode npm run erp:conferir-migracao.';
  END;
END $$;

-- ------------------------------------------------------------ chaves estrangeiras (todas compostas com o parceiro)
ALTER TABLE "DocumentoFiscal" ADD CONSTRAINT "DocumentoFiscal_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentoFiscal" ADD CONSTRAINT "DocumentoFiscal_parceiroId_lojaId_fkey" FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentoFiscal" ADD CONSTRAINT "DocumentoFiscal_parceiroId_fornecedorId_fkey" FOREIGN KEY ("parceiroId", "fornecedorId") REFERENCES "Fornecedor"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentoFiscal" ADD CONSTRAINT "DocumentoFiscal_parceiroId_notaEntradaId_fkey" FOREIGN KEY ("parceiroId", "notaEntradaId") REFERENCES "NotaEntrada"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentoFiscalItem" ADD CONSTRAINT "DocumentoFiscalItem_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentoFiscalItem" ADD CONSTRAINT "DocumentoFiscalItem_parceiroId_documentoId_fkey" FOREIGN KEY ("parceiroId", "documentoId") REFERENCES "DocumentoFiscal"("parceiroId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentoFiscalItem" ADD CONSTRAINT "DocumentoFiscalItem_parceiroId_insumoId_fkey" FOREIGN KEY ("parceiroId", "insumoId") REFERENCES "Insumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentoFiscalItem" ADD CONSTRAINT "DocumentoFiscalItem_parceiroId_varianteId_fkey" FOREIGN KEY ("parceiroId", "varianteId") REFERENCES "InsumoVariante"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentoFiscalItem" ADD CONSTRAINT "DocumentoFiscalItem_parceiroId_vinculoId_fkey" FOREIGN KEY ("parceiroId", "vinculoId") REFERENCES "VinculoItemFornecedor"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VinculoItemFornecedor" ADD CONSTRAINT "VinculoItemFornecedor_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VinculoItemFornecedor" ADD CONSTRAINT "VinculoItemFornecedor_parceiroId_fornecedorId_fkey" FOREIGN KEY ("parceiroId", "fornecedorId") REFERENCES "Fornecedor"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VinculoItemFornecedor" ADD CONSTRAINT "VinculoItemFornecedor_parceiroId_insumoId_fkey" FOREIGN KEY ("parceiroId", "insumoId") REFERENCES "Insumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VinculoItemFornecedor" ADD CONSTRAINT "VinculoItemFornecedor_parceiroId_varianteId_fkey" FOREIGN KEY ("parceiroId", "varianteId") REFERENCES "InsumoVariante"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------ gatilhos
-- Dono da linha é imutável (a mesma função de todas as tabelas de tenant).
CREATE TRIGGER "DocumentoFiscal_parceiro_imutavel" BEFORE UPDATE ON "DocumentoFiscal"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();
CREATE TRIGGER "DocumentoFiscalItem_parceiro_imutavel" BEFORE UPDATE ON "DocumentoFiscalItem"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();
CREATE TRIGGER "VinculoItemFornecedor_parceiro_imutavel" BEFORE UPDATE ON "VinculoItemFornecedor"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();

-- O documento fiscal é o que o emitente declarou: o conteúdo NUNCA muda. Só andam a situação (por caminhos permitidos), a loja e o
-- fornecedor (uma vez, de nulo para um valor), a nota ligada, o motivo e a hora do cancelamento. O cancelado não volta.
CREATE OR REPLACE FUNCTION "erp_documento_fiscal_conteudo_imutavel"() RETURNS trigger AS $$
BEGIN
  IF OLD."situacao" = 'CANCELADO' THEN
    RAISE EXCEPTION '[erp] o documento fiscal cancelado não muda mais (DocumentoFiscal_conteudo_imutavel).' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW."chaveAcesso", NEW."modelo", NEW."serie", NEW."numero", NEW."emitidaEm", NEW."emitenteDocumento", NEW."emitenteRazao",
      NEW."emitenteFantasia", NEW."emitenteIe", NEW."emitenteUf", NEW."emitenteMunicipio", NEW."emitenteEndereco", NEW."emitenteCep",
      NEW."destinatarioDocumento", NEW."vProdCentavos", NEW."vDescCentavos", NEW."vFreteCentavos", NEW."vSegCentavos", NEW."vOutroCentavos",
      NEW."vIpiCentavos", NEW."vStCentavos", NEW."vNfCentavos", NEW."duplicatas", NEW."origem", NEW."xmlSha256", NEW."xml", NEW."criadoEm", NEW."criadoPorNome")
     IS DISTINCT FROM
     (OLD."chaveAcesso", OLD."modelo", OLD."serie", OLD."numero", OLD."emitidaEm", OLD."emitenteDocumento", OLD."emitenteRazao",
      OLD."emitenteFantasia", OLD."emitenteIe", OLD."emitenteUf", OLD."emitenteMunicipio", OLD."emitenteEndereco", OLD."emitenteCep",
      OLD."destinatarioDocumento", OLD."vProdCentavos", OLD."vDescCentavos", OLD."vFreteCentavos", OLD."vSegCentavos", OLD."vOutroCentavos",
      OLD."vIpiCentavos", OLD."vStCentavos", OLD."vNfCentavos", OLD."duplicatas", OLD."origem", OLD."xmlSha256", OLD."xml", OLD."criadoEm", OLD."criadoPorNome") THEN
    RAISE EXCEPTION '[erp] o conteúdo do documento fiscal não se altera (DocumentoFiscal_conteudo_imutavel).' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."lojaId" IS NOT NULL AND NEW."lojaId" IS DISTINCT FROM OLD."lojaId" THEN
    RAISE EXCEPTION '[erp] a loja do documento fiscal, depois de resolvida, não troca (DocumentoFiscal_conteudo_imutavel).' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."fornecedorId" IS NOT NULL AND NEW."fornecedorId" IS DISTINCT FROM OLD."fornecedorId" THEN
    RAISE EXCEPTION '[erp] o fornecedor do documento fiscal, depois de resolvido, não troca (DocumentoFiscal_conteudo_imutavel).' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."situacao" <> OLD."situacao" AND NOT (
       (OLD."situacao" = 'AGUARDANDO_CONFERENCIA' AND NEW."situacao" IN ('CONCILIADO', 'CANCELADO'))
    OR (OLD."situacao" = 'CONCILIADO' AND NEW."situacao" = 'AGUARDANDO_CONFERENCIA')
    OR (OLD."situacao" IN ('RECEBIDO', 'ERRO') AND NEW."situacao" = 'AGUARDANDO_CONFERENCIA')
  ) THEN
    RAISE EXCEPTION '[erp] o documento fiscal não vai de % para % (DocumentoFiscal_conteudo_imutavel).', OLD."situacao", NEW."situacao" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DocumentoFiscal_conteudo_imutavel" BEFORE UPDATE ON "DocumentoFiscal"
  FOR EACH ROW EXECUTE FUNCTION "erp_documento_fiscal_conteudo_imutavel"();

-- O item do documento: o que veio na nota não muda; a resolução (insumo, embalagem, fator, memória) só muda enquanto o documento
-- aguarda conferência (depois de conciliado fica o que foi usado). E o item só nasce com o documento que o contém.
CREATE OR REPLACE FUNCTION "erp_documento_fiscal_item_so_na_conferencia"() RETURNS trigger AS $$
DECLARE
  s text;
BEGIN
  SELECT d."situacao"::text INTO s FROM "DocumentoFiscal" d WHERE d."parceiroId" = NEW."parceiroId" AND d."id" = NEW."documentoId";
  IF s IS DISTINCT FROM 'AGUARDANDO_CONFERENCIA' THEN
    RAISE EXCEPTION '[erp] o item só entra e só muda a resolução enquanto o documento aguarda conferência (DocumentoFiscalItem_so_na_conferencia).' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW."documentoId", NEW."nItem", NEW."codigoProduto", NEW."gtin", NEW."descricao", NEW."ncm", NEW."cfop", NEW."unidadeComercial",
      NEW."qComTexto", NEW."qComMilesimos", NEW."vProdCentavos", NEW."vDescCentavos", NEW."vOutroCentavos", NEW."vSegCentavos", NEW."vIpiCentavos",
      NEW."vStCentavos", NEW."vFreteCentavos", NEW."liquidoCentavos")
     IS DISTINCT FROM
     (OLD."documentoId", OLD."nItem", OLD."codigoProduto", OLD."gtin", OLD."descricao", OLD."ncm", OLD."cfop", OLD."unidadeComercial",
      OLD."qComTexto", OLD."qComMilesimos", OLD."vProdCentavos", OLD."vDescCentavos", OLD."vOutroCentavos", OLD."vSegCentavos", OLD."vIpiCentavos",
      OLD."vStCentavos", OLD."vFreteCentavos", OLD."liquidoCentavos") THEN
    RAISE EXCEPTION '[erp] o que veio na nota fiscal não se altera; só a resolução do item (DocumentoFiscalItem_so_na_conferencia).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DocumentoFiscalItem_so_na_conferencia" BEFORE INSERT OR UPDATE ON "DocumentoFiscalItem"
  FOR EACH ROW EXECUTE FUNCTION "erp_documento_fiscal_item_so_na_conferencia"();

-- A memória só muda de dono por inteiro: o fornecedor, o código e a unidade que a identificam não trocam.
CREATE OR REPLACE FUNCTION "erp_vinculo_item_chave_imutavel"() RETURNS trigger AS $$
BEGIN
  IF (NEW."fornecedorId", NEW."codigoProduto", NEW."unidadeComercial") IS DISTINCT FROM (OLD."fornecedorId", OLD."codigoProduto", OLD."unidadeComercial") THEN
    RAISE EXCEPTION '[erp] a memória do item não troca de fornecedor, código nem unidade (VinculoItemFornecedor_chave_imutavel).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "VinculoItemFornecedor_chave_imutavel" BEFORE UPDATE ON "VinculoItemFornecedor"
  FOR EACH ROW EXECUTE FUNCTION "erp_vinculo_item_chave_imutavel"();

-- ------------------------------------------------------------ RLS
-- O mesmo padrão condicional da 0.2 e das demais (só se quem roda pode instalar por inteiro). Se as tabelas antigas JÁ têm RLS e
-- uma destas não puder ser instalada, a migration falha com a frase: tabela sem GRANT para o papel quebraria o ERP em tempo de
-- execução, e é melhor o deploy parar do que o ERP.
--
-- Grants mínimos: ler, incluir e mudar; nada de DELETE (o documento, o item e a memória não se apagam pelo app).
DO $$
DECLARE
  tabela text;
  permissoes text := 'SELECT, INSERT, UPDATE';
  ja_tem_rls boolean;
  eu record;
  dono boolean;
  pode_assumir boolean;
BEGIN
  SELECT coalesce(relrowsecurity, false) INTO ja_tem_rls FROM pg_class WHERE oid = to_regclass('"Loja"');
  SELECT rolsuper, rolcreaterole INTO eu FROM pg_roles WHERE rolname = current_user;

  FOREACH tabela IN ARRAY ARRAY['DocumentoFiscal', 'DocumentoFiscalItem', 'VinculoItemFornecedor'] LOOP
    dono := pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = to_regclass(format('%I', tabela))), 'USAGE');
    IF NOT coalesce(dono, false) THEN
      IF ja_tem_rls THEN RAISE EXCEPTION 'ERP F.1b: % não é dono de "%": a RLS não pode ser instalada nela.', current_user, tabela; END IF;
      RAISE NOTICE 'ERP RLS NÃO instalada em %: % não é dono. O portão segue isolando sem o papel erp_tenant.', tabela, current_user;
      CONTINUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
      IF NOT (eu.rolsuper OR eu.rolcreaterole) THEN
        IF ja_tem_rls THEN RAISE EXCEPTION 'ERP F.1b: o papel erp_tenant não existe e % não pode criá-lo.', current_user; END IF;
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
        IF ja_tem_rls THEN RAISE EXCEPTION 'ERP F.1b: % não consegue assumir o papel erp_tenant.', current_user; END IF;
        RAISE NOTICE 'ERP RLS NÃO instalada em %: % não consegue assumir o papel erp_tenant.', tabela, current_user;
        CONTINUE;
      END;
    END IF;

    EXECUTE format('GRANT USAGE ON SCHEMA %I TO erp_tenant', current_schema());
    EXECUTE format('GRANT %s ON %I TO erp_tenant', permissoes, tabela);
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
