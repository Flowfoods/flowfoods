-- ERP N.1 — custo médio ponderado por LOJA para valorizar o estoque e o CMV
-- (decisão de Rodolfo em 23/10/2026, 10:58 UTC). O último preço da rede segue
-- como referência SEPARADA para precificar fichas.
--
-- Só ADITIVA e sem tocar em dado existente:
--   - "Loja"."custoMedioDesde": marco de corte por LOJA (o custo médio é da loja,
--     e cada loja tem o seu fechamento). NULO = o método antigo continua valendo
--     (nenhuma loja muda sozinha). Só a FlowFoods liga, depois de ler o relatório
--     de impacto; períodos fechados não mudam. Fica na Loja (tabela do tenant,
--     com RLS) porque o papel do tenant não lê ParceiroFlow.
--   - "SaldoEstoque"."valorIncompleto": o saldo tem quantidade cujo custo é
--     desconhecido (abertura sem custo, por exemplo). Desconhecido não é zero.
--   - "MovimentoEstoque"."valorMetodo": como o valor do movimento foi obtido
--     (auditoria). NULO = movimento anterior ao método (como sempre foi).
-- Livro continua só INSERT; nada é recalculado para trás.

ALTER TABLE "Loja" ADD COLUMN "custoMedioDesde" TIMESTAMP(3);
-- A diferença de base no instante da troca (valor do livro − valor pela regra antiga, sem os itens de custo
-- desconhecido): o período que atravessa a troca mostra este número, em vez de misturar as bases em silêncio.
ALTER TABLE "Loja" ADD COLUMN "custoMedioPonteCentavos" INTEGER;

ALTER TABLE "SaldoEstoque" ADD COLUMN "valorIncompleto" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MovimentoEstoque" ADD COLUMN "valorMetodo" TEXT;
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_valorMetodo_check"
  CHECK ("valorMetodo" IS NULL OR "valorMetodo" IN ('INFORMADO', 'MEDIA_LOJA', 'ESTORNO', 'REFERENCIA', 'SEM_CUSTO'));
