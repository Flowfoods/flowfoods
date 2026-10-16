-- ERP 1.5 — Entrada de compra (nota) e custo pelo último preço.
--
-- Só ADITIVA. As tabelas "Fornecedor", "NotaEntrada" e "NotaEntradaItem" já
-- existem desde a 0.1 (com portão, RLS, GRANT e trigger de parceiro imutável):
-- nenhuma tabela nova, então nada muda no portão nem na RLS. Roda igual com o
-- usuário superusuário (produção hoje) ou com o dono não-superusuário.
--
-- A nota NÃO gera movimento de estoque nesta fase (decisão 64): o estoque da
-- loja só abre na 1.6. O custo do insumo passa a ser o da última nota lançada
-- (derivado na leitura, nunca gravado: decisão 65).

-- Fornecedor: versão para a edição condicional.
ALTER TABLE "Fornecedor" ADD COLUMN "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Nota: série ('' = sem série), versão, cancelamento.
ALTER TABLE "NotaEntrada"
  ADD COLUMN "serie" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "canceladaEm" TIMESTAMP(3),
  ADD COLUMN "motivoCancelamento" TEXT;

-- Item: frete rateado, embalagem como foi comprada, ordem da linha.
ALTER TABLE "NotaEntradaItem"
  ADD COLUMN "freteRateadoCentavos" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "embalagemSnapshot" TEXT,
  ADD COLUMN "ordem" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "NotaEntradaItem" ADD CONSTRAINT "NotaEntradaItem_freteRateado_naoneg" CHECK ("freteRateadoCentavos" >= 0);

-- Número e série curtos e sem espaço nas pontas (o servidor normaliza antes).
ALTER TABLE "NotaEntrada" ADD CONSTRAINT "NotaEntrada_numero_serie_formato" CHECK (
  ("numero" IS NULL OR (char_length("numero") BETWEEN 1 AND 20 AND "numero" = btrim("numero")))
  AND char_length("serie") <= 10 AND "serie" = btrim("serie")
);

-- Cancelada ⇔ tem data de cancelamento; lançada ⇒ tem data de lançamento.
ALTER TABLE "NotaEntrada" ADD CONSTRAINT "NotaEntrada_cancelamento_coerente" CHECK (
  ("status" = 'CANCELADA') = ("canceladaEm" IS NOT NULL)
  AND ("status" <> 'LANCADA' OR "lancadaEm" IS NOT NULL)
);

-- Idempotência: a mesma nota (fornecedor + número + série) não entra duas
-- vezes no parceiro. Cancelada não conta: a nota digitada errado é cancelada e
-- relançada certa. Índice parcial (o Prisma não descreve: escrito só aqui —
-- migration futura que mexa nele reescreve à mão). Corrida: dois lançamentos
-- simultâneos da mesma nota, um entra e o outro recebe a violação (P2002).
CREATE UNIQUE INDEX "NotaEntrada_chave_da_nota" ON "NotaEntrada"("parceiroId", "fornecedorId", "numero", "serie")
  WHERE "status" <> 'CANCELADA' AND "fornecedorId" IS NOT NULL AND "numero" IS NOT NULL;

-- Último preço: a nota mais recente de cada insumo (data da nota, depois a hora do lançamento).
CREATE INDEX "NotaEntrada_parceiroId_status_entradaEm_idx" ON "NotaEntrada"("parceiroId", "status", "entradaEm" DESC, "lancadaEm" DESC);
