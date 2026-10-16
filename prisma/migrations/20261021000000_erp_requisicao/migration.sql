-- ERP 1.8 — Requisição: o setor pede, o estoque entrega, a baixa sai daqui;
-- devolução por estorno; cruzamento requisição × contagem (só leitura).
--
-- ADITIVA (nenhuma regra existente trocada; a decisão 71 não se repete).
-- "Requisicao", "RequisicaoItem" e "MovimentoEstoque" existem desde a 0.1 com
-- portão, RLS, GRANT e trigger de parceiro imutável: nenhuma tabela nova,
-- então nada muda no portão nem na RLS. Roda igual com o usuário
-- superusuário (produção hoje) ou com o dono não-superusuário (com ou sem a
-- RLS instalada). Antes desta fase nada gravava requisição; se alguma linha
-- gravada por fora violar um CHECK novo, a migration falha com o nome dele e
-- nada muda.

-- ----------------------------------------------------------- estado
-- Atendida em parte: saiu parte, o resto ainda pode sair. O valor novo não é
-- usado neste arquivo (o Postgres só o libera depois do COMMIT).
ALTER TYPE "RequisicaoStatus" ADD VALUE 'PARCIAL';

-- ----------------------------------------------------------- requisição
ALTER TABLE "Requisicao"
  ADD COLUMN "numero" INTEGER,
  ADD COLUMN "versao" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "paraDia" DATE,
  ADD COLUMN "pedidaPorNome" TEXT,
  ADD COLUMN "atendidaPorNome" TEXT,
  ADD COLUMN "canceladaPorNome" TEXT,
  ADD COLUMN "canceladaEm" TIMESTAMP(3),
  ADD COLUMN "motivoCancelamento" TEXT,
  ADD COLUMN "fichaId" TEXT,
  ADD COLUMN "fichaNomeSnapshot" TEXT,
  ADD COLUMN "fichaQuantidadeMilesimos" INTEGER;

ALTER TABLE "Requisicao" ADD CONSTRAINT "Requisicao_parceiroId_fichaId_fkey"
  FOREIGN KEY ("parceiroId", "fichaId") REFERENCES "FichaTecnica"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Número por loja (#12): único na loja; dado sob a trava da loja.
CREATE UNIQUE INDEX "Requisicao_parceiroId_lojaId_numero_key" ON "Requisicao"("parceiroId", "lojaId", "numero");
-- O quadro lê por loja e estado.
CREATE INDEX "Requisicao_parceiroId_lojaId_status_idx" ON "Requisicao"("parceiroId", "lojaId", "status");

ALTER TABLE "Requisicao" ADD CONSTRAINT "Requisicao_numero_positivo" CHECK ("numero" IS NULL OR "numero" > 0);
ALTER TABLE "Requisicao" ADD CONSTRAINT "Requisicao_versao_naoneg" CHECK ("versao" >= 0);
-- O setor é um dos da 0.4 (a chave, como no vínculo da pessoa).
ALTER TABLE "Requisicao" ADD CONSTRAINT "Requisicao_setor_da_lista" CHECK (
  "setor" IS NULL OR "setor" IN ('COZINHA', 'SALAO', 'ADMINISTRATIVO', 'ESTOQUE', 'CAIXA', 'MOTOBOY', 'FREELANCER', 'COMPRAS', 'MARKETING_CRM', 'GERENCIA')
);
-- Cancelada ⇔ data e motivo; atendida (inteira ou encerrada) tem a data.
ALTER TABLE "Requisicao" ADD CONSTRAINT "Requisicao_cancelada_coerente" CHECK (
  ("status" = 'CANCELADA') = ("canceladaEm" IS NOT NULL) AND ("canceladaEm" IS NULL OR "motivoCancelamento" IS NOT NULL)
);
ALTER TABLE "Requisicao" ADD CONSTRAINT "Requisicao_atendida_tem_data" CHECK ("status" <> 'ATENDIDA' OR "atendidaEm" IS NOT NULL);
ALTER TABLE "Requisicao" ADD CONSTRAINT "Requisicao_textos_curtos" CHECK (
  ("observacao" IS NULL OR length("observacao") <= 280) AND ("motivoCancelamento" IS NULL OR length("motivoCancelamento") BETWEEN 3 AND 200)
);
-- Puxada de uma ficha: ficha, nome e quanto se ia produzir andam juntos.
ALTER TABLE "Requisicao" ADD CONSTRAINT "Requisicao_ficha_coerente" CHECK (
  ("fichaId" IS NULL) = ("fichaNomeSnapshot" IS NULL) AND ("fichaId" IS NULL) = ("fichaQuantidadeMilesimos" IS NULL)
  AND ("fichaQuantidadeMilesimos" IS NULL OR "fichaQuantidadeMilesimos" > 0)
);

-- ----------------------------------------------------------- item
-- "atendido" é o LÍQUIDO que saiu (entregas − devoluções); o devolvido fica à vista.
ALTER TABLE "RequisicaoItem"
  ADD COLUMN "devolvidoMilesimos" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ordem" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "RequisicaoItem" ADD CONSTRAINT "RequisicaoItem_devolvido_naoneg" CHECK ("devolvidoMilesimos" >= 0 AND "ordem" >= 0);

-- ----------------------------------------------------------- livro-razão
-- A baixa pela requisição aponta o item pedido (CHECK novo, ao lado do
-- "documento pelo tipo" da 1.6 e do "contagem tem item" da 1.7, que não mudam).
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_requisicao_tem_item" CHECK ("tipo" <> 'REQUISICAO' OR "requisicaoItemId" IS NOT NULL);
