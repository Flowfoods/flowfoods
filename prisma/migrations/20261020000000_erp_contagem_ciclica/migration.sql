-- ERP 1.7 — Contagem: inventário cíclico que fecha sozinho e piso obrigatório
-- no fechamento do período.
--
-- ADITIVA (nenhuma regra existente trocada; nada da decisão 71 se repete).
-- "Contagem", "ContagemItem", "MovimentoEstoque", "Loja" e "PeriodoApuracao"
-- existem desde a 0.1 com portão, RLS, GRANT e trigger de parceiro imutável:
-- nenhuma tabela nova, então nada muda no portão nem na RLS. Roda igual com o
-- usuário superusuário (produção hoje) ou com o dono não-superusuário (com ou
-- sem a RLS instalada). Se alguma linha gravada por fora violar um CHECK
-- novo, a migration falha com o nome dele e nada muda.

-- ----------------------------------------------------------- desfecho
-- Como uma contagem FECHADA terminou: aplicada pelo gerente, aplicada sozinha
-- (tudo contado e dentro da tolerância) ou vencida (passou do prazo, fechou
-- sem mexer no estoque).
CREATE TYPE "ContagemDesfecho" AS ENUM ('APLICADA', 'APLICADA_SOZINHA', 'VENCIDA');

ALTER TABLE "Contagem"
  ADD COLUMN "titulo" TEXT,
  ADD COLUMN "desfecho" "ContagemDesfecho";

-- As aberturas já concluídas (1.6) foram aplicadas. A RLS FORÇADA (dono
-- não-superusuário) esconderia as linhas do dono: só nesta transação, e só
-- se estiver forçada, o FORCE sai e volta (quem roda a migration é o dono).
DO $$
DECLARE
  forcada boolean;
BEGIN
  SELECT c.relforcerowsecurity INTO forcada FROM pg_class c WHERE c.oid = '"Contagem"'::regclass;
  IF forcada THEN
    EXECUTE 'ALTER TABLE "Contagem" NO FORCE ROW LEVEL SECURITY';
  END IF;
  UPDATE "Contagem" SET "desfecho" = 'APLICADA' WHERE "status" = 'FECHADA' AND "desfecho" IS NULL;
  IF forcada THEN
    EXECUTE 'ALTER TABLE "Contagem" FORCE ROW LEVEL SECURITY';
  END IF;
END
$$;

ALTER TABLE "Contagem" ADD CONSTRAINT "Contagem_desfecho_coerente" CHECK (("status" = 'FECHADA') = ("desfecho" IS NOT NULL));
-- Só a cíclica fecha sozinha ou vence; abertura e fechamento do período são aplicados por alguém.
ALTER TABLE "Contagem" ADD CONSTRAINT "Contagem_desfecho_do_tipo" CHECK ("desfecho" IS NULL OR "desfecho" = 'APLICADA' OR "tipo" = 'CICLICA');
-- Cíclica tem prazo (fecha sozinha sem aplicar quando passa); fechamento aponta o período.
ALTER TABLE "Contagem" ADD CONSTRAINT "Contagem_ciclica_tem_prazo" CHECK ("tipo" <> 'CICLICA' OR "fechaAutomaticoEm" IS NOT NULL);
ALTER TABLE "Contagem" ADD CONSTRAINT "Contagem_fechamento_tem_periodo" CHECK ("tipo" <> 'FECHAMENTO' OR "periodoId" IS NOT NULL);
ALTER TABLE "Contagem" ADD CONSTRAINT "Contagem_titulo_curto" CHECK ("titulo" IS NULL OR length("titulo") BETWEEN 1 AND 120);

-- Um fechamento por loja e período (fora os descartados): dois "Começar o
-- fechamento" juntos dão a mesma contagem (P2002 na corrida). Índice parcial
-- (o Prisma não descreve WHERE: escrito só aqui; `migrate diff` segue vazio).
CREATE UNIQUE INDEX "Contagem_um_fechamento_por_loja_e_periodo" ON "Contagem"("parceiroId", "lojaId", "periodoId")
  WHERE "tipo" = 'FECHAMENTO' AND "status" <> 'CANCELADA';

-- ----------------------------------------------------------- livro-razão
-- O acerto pela contagem aponta o item contado (CHECK novo, ao lado do
-- "documento pelo tipo" da 1.6, que não muda).
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_contagem_tem_item" CHECK ("tipo" <> 'CONTAGEM' OR "contagemItemId" IS NOT NULL);

-- ----------------------------------------------------------- regras da loja
-- Piso do fechamento (pontos-base), frequência por classe da curva ABC (dias)
-- e tolerância para fechar sozinha (centavos por item). Defaults = as regras
-- de partida; toda loja que existe ganha os mesmos.
ALTER TABLE "Loja"
  ADD COLUMN "contagemPisoValorBp" INTEGER NOT NULL DEFAULT 8000,
  ADD COLUMN "contagemPisoItensBp" INTEGER NOT NULL DEFAULT 5000,
  ADD COLUMN "contagemFreqADias" INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN "contagemFreqBDias" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "contagemFreqCDias" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "contagemToleranciaCentavos" INTEGER NOT NULL DEFAULT 500;

ALTER TABLE "Loja" ADD CONSTRAINT "Loja_contagem_piso_faixa" CHECK ("contagemPisoValorBp" BETWEEN 5000 AND 10000 AND "contagemPisoItensBp" BETWEEN 0 AND 10000);
ALTER TABLE "Loja" ADD CONSTRAINT "Loja_contagem_frequencia_faixa" CHECK (
  "contagemFreqADias" BETWEEN 1 AND 90 AND "contagemFreqBDias" BETWEEN 1 AND 90 AND "contagemFreqCDias" BETWEEN 1 AND 90
  AND "contagemFreqADias" <= "contagemFreqBDias" AND "contagemFreqBDias" <= "contagemFreqCDias"
);
ALTER TABLE "Loja" ADD CONSTRAINT "Loja_contagem_tolerancia_faixa" CHECK ("contagemToleranciaCentavos" BETWEEN 0 AND 100000);
