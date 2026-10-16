-- ERP 1.6 — Estoque: abertura do zero (1ª contagem = saldo inicial) e a nota
-- de compra movimentando o estoque da loja aberta.
--
-- ADITIVA. "Contagem", "ContagemItem", "MovimentoEstoque" e "SaldoEstoque"
-- existem desde a 0.1 (com portão, RLS, GRANT e trigger de parceiro
-- imutável): nenhuma tabela nova, então nada muda no portão nem na RLS. Roda
-- igual com o usuário superusuário (produção hoje) ou com o dono
-- não-superusuário. Antes desta fase nada gravava movimento nem contagem
-- (decisão 64), então os CHECKs novos/trocados valem sobre tabelas vazias; se
-- houver linha gravada por fora que viole, a migration falha com o nome do
-- CHECK e nada muda.

-- ----------------------------------------------------------- contagem
-- Versão: sobe a cada número salvo (trava a contagem e é a "versão
-- conferida" do concluir). Quem começou e quem concluiu (snapshot do nome).
ALTER TABLE "Contagem"
  ADD COLUMN "versao" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "iniciadaPorNome" TEXT,
  ADD COLUMN "fechadaPorNome" TEXT,
  ADD COLUMN "naoContadosNoFechamento" INTEGER;

ALTER TABLE "Contagem" ADD CONSTRAINT "Contagem_versao_naoneg" CHECK ("versao" >= 0);
ALTER TABLE "Contagem" ADD CONSTRAINT "Contagem_fechada_coerente" CHECK (("status" = 'FECHADA') = ("fechadaEm" IS NOT NULL));
ALTER TABLE "Contagem" ADD CONSTRAINT "Contagem_naoContados_naoneg" CHECK ("naoContadosNoFechamento" >= 0);

-- Uma abertura por loja (fora as descartadas): dois "Abrir estoque" ao mesmo
-- tempo, um entra e o outro recebe a violação (P2002). Índice parcial (o
-- Prisma não descreve WHERE: escrito só aqui; `migrate diff` segue vazio).
CREATE UNIQUE INDEX "Contagem_uma_abertura_por_loja" ON "Contagem"("parceiroId", "lojaId")
  WHERE "tipo" = 'ABERTURA' AND "status" <> 'CANCELADA';

-- ----------------------------------------------------------- item contado
-- Lista e fatores congelados ao abrir a contagem (snapshot), o que foi
-- digitado (embalagens fechadas + solto, e a escala) separado do normalizado
-- ("contadoMilesimos"), versão do item (dois contadores) e quem contou.
ALTER TABLE "ContagemItem"
  ADD COLUMN "versao" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "conservacaoSnapshot" "Conservacao",
  ADD COLUMN "embalagemSnapshot" TEXT,
  ADD COLUMN "embalagemConteudoMilesimos" INTEGER,
  ADD COLUMN "embalagensMilesimos" INTEGER,
  ADD COLUMN "soltoMilesimos" INTEGER,
  ADD COLUMN "escalaDigitada" TEXT,
  ADD COLUMN "contadoPorNome" TEXT;

ALTER TABLE "ContagemItem" ADD CONSTRAINT "ContagemItem_versao_naoneg" CHECK ("versao" >= 0);
-- Vazio = NÃO CONTADO (null), zero é contagem: o "quando" anda junto com o número.
ALTER TABLE "ContagemItem" ADD CONSTRAINT "ContagemItem_contado_coerente" CHECK (("contadoMilesimos" IS NULL) = ("contadoEm" IS NULL));
ALTER TABLE "ContagemItem" ADD CONSTRAINT "ContagemItem_digitado_naoneg" CHECK (
  ("embalagensMilesimos" IS NULL OR "embalagensMilesimos" >= 0)
  AND ("soltoMilesimos" IS NULL OR "soltoMilesimos" >= 0)
  AND ("embalagemConteudoMilesimos" IS NULL OR "embalagemConteudoMilesimos" > 0)
  AND ("escalaDigitada" IS NULL OR "escalaDigitada" IN ('base', 'menor'))
);

-- ----------------------------------------------------------- livro-razão
-- "notaId": a nota (cabeçalho) que gerou a entrada. Editar a nota troca os
-- itens por inteiro (1.5); o razão aponta o documento estável, nunca apagado
-- (nota se cancela), e guarda o item no snapshot do próprio movimento.
-- "estornoDeId": o movimento que este desfaz (cancelar/editar a nota). Único:
-- nada se estorna duas vezes.
ALTER TABLE "MovimentoEstoque"
  ADD COLUMN "notaId" TEXT,
  ADD COLUMN "estornoDeId" TEXT;

ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_parceiroId_notaId_fkey"
  FOREIGN KEY ("parceiroId", "notaId") REFERENCES "NotaEntrada"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- NO ACTION (e não RESTRICT): a limpeza administrativa/LGPD apaga o original e
-- o estorno no mesmo DELETE (a FK é conferida no fim do comando).
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_parceiroId_estornoDeId_fkey"
  FOREIGN KEY ("parceiroId", "estornoDeId") REFERENCES "MovimentoEstoque"("parceiroId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE UNIQUE INDEX "MovimentoEstoque_parceiroId_estornoDeId_key" ON "MovimentoEstoque"("parceiroId", "estornoDeId");
CREATE INDEX "MovimentoEstoque_parceiroId_notaId_idx" ON "MovimentoEstoque"("parceiroId", "notaId");

-- O sinal pelo tipo (0.1) continua para o movimento comum; o ESTORNO tem o
-- sinal contrário do tipo que ele desfaz (o espelho exato é conferido pelo
-- trigger abaixo). Trocar o CHECK = apagar e criar de novo (Postgres não
-- altera CHECK); as linhas que já existiam têm "estornoDeId" nulo e caem na
-- mesma regra de antes.
ALTER TABLE "MovimentoEstoque" DROP CONSTRAINT "MovimentoEstoque_sinal_do_tipo";
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_sinal_do_tipo" CHECK (
  ("estornoDeId" IS NULL AND (
    ("tipo" IN ('ABERTURA', 'ENTRADA_COMPRA', 'PRODUCAO_ENTRADA') AND "quantidadeMilesimos" > 0)
    OR ("tipo" IN ('REQUISICAO', 'PRODUCAO_CONSUMO', 'PERDA') AND "quantidadeMilesimos" < 0)
    OR "tipo" IN ('AJUSTE', 'CONTAGEM')
  ))
  OR ("estornoDeId" IS NOT NULL AND (
    ("tipo" IN ('ABERTURA', 'ENTRADA_COMPRA', 'PRODUCAO_ENTRADA') AND "quantidadeMilesimos" < 0)
    OR ("tipo" IN ('REQUISICAO', 'PRODUCAO_CONSUMO', 'PERDA') AND "quantidadeMilesimos" > 0)
    OR "tipo" IN ('AJUSTE', 'CONTAGEM')
  ))
);

-- No máximo um documento de origem (agora com a nota) — o estorno aponta o
-- mesmo documento do movimento que desfaz.
ALTER TABLE "MovimentoEstoque" DROP CONSTRAINT "MovimentoEstoque_um_documento";
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_um_documento" CHECK (
  num_nonnulls("notaId", "notaItemId", "requisicaoItemId", "contagemItemId", "ordemProducaoId") <= 1
);

-- Documento pelo tipo: entrada de compra vem de nota; abertura, do item da contagem.
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_documento_do_tipo" CHECK (
  ("tipo" <> 'ENTRADA_COMPRA' OR num_nonnulls("notaId", "notaItemId") = 1)
  AND ("tipo" <> 'ABERTURA' OR "contagemItemId" IS NOT NULL)
);

-- Estorno é espelho exato: mesma loja, insumo, tipo e documento; quantidade e
-- valor com o sinal trocado; e não se estorna um estorno. Conferido no banco
-- (até SQL cru dentro do contexto passa por aqui). Debaixo do papel
-- erp_tenant a leitura do original já é do mesmo parceiro (RLS).
CREATE OR REPLACE FUNCTION "erp_conferir_estorno"() RETURNS trigger AS $$
DECLARE
  o RECORD;
BEGIN
  IF NEW."estornoDeId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO o FROM "MovimentoEstoque"
    WHERE "parceiroId" = NEW."parceiroId" AND "id" = NEW."estornoDeId";
  IF NOT FOUND THEN
    RAISE EXCEPTION '[erp] estorno de um movimento que não existe.' USING ERRCODE = 'check_violation';
  END IF;
  IF o."estornoDeId" IS NOT NULL
     OR o."lojaId" <> NEW."lojaId" OR o."insumoId" <> NEW."insumoId" OR o."tipo" <> NEW."tipo"
     OR NEW."quantidadeMilesimos" <> -o."quantidadeMilesimos" OR NEW."valorCentavos" <> -o."valorCentavos"
     OR o."notaId" IS DISTINCT FROM NEW."notaId"
     OR o."notaItemId" IS DISTINCT FROM NEW."notaItemId"
     OR o."requisicaoItemId" IS DISTINCT FROM NEW."requisicaoItemId"
     OR o."contagemItemId" IS DISTINCT FROM NEW."contagemItemId"
     OR o."ordemProducaoId" IS DISTINCT FROM NEW."ordemProducaoId" THEN
    RAISE EXCEPTION '[erp] estorno precisa ser o espelho exato do movimento (MovimentoEstoque_estorno_espelho).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MovimentoEstoque_estorno_espelho" BEFORE INSERT ON "MovimentoEstoque"
  FOR EACH ROW EXECUTE FUNCTION "erp_conferir_estorno"();
