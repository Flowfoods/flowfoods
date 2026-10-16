-- ERP 1.9 — Precificação dentro da ficha técnica: custo por canal em camadas
-- (loja = insumos; delivery = + embalagem; iFood = + embalagem + taxa).
--
-- ADITIVA (nenhuma regra existente trocada; a decisão 71 não se repete).
-- "ProdutoVenda", "ProdutoEmbalagem" e "CanalConfig" existem desde a 0.1 com
-- portão, RLS, GRANT e trigger de parceiro imutável: nenhuma tabela nova,
-- então nada muda no portão nem na RLS. Roda igual com o usuário
-- superusuário (produção hoje) ou com o dono não-superusuário (com ou sem a
-- RLS instalada). Antes desta fase nada gravava nessas tabelas; se alguma
-- linha gravada por fora violar um CHECK novo, a migration falha com o nome
-- dele e nada muda.

-- ----------------------------------------------------------- taxa do canal
-- O iFood cobra duas porcentagens sobre o preço: a comissão do plano
-- ("taxaBp", desde a 0.1) e a taxa de pagamento online (nova). Separadas como
-- o contrato do iFood as mostra (decisão 81). Pontos-base: 3,2 % = 320.
ALTER TABLE "CanalConfig" ADD COLUMN "taxaPagamentoBp" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "CanalConfig" ADD CONSTRAINT "CanalConfig_taxaPagamentoBp_faixa"
  CHECK ("taxaPagamentoBp" BETWEEN 0 AND 10000);
-- Somadas, abaixo de 100 % do preço (com 100 % nenhum preço cobre o custo).
ALTER TABLE "CanalConfig" ADD CONSTRAINT "CanalConfig_taxas_abaixo_de_100"
  CHECK ("taxaBp" + "taxaPagamentoBp" < 10000);

-- ----------------------------------------------------------- embalagem por canal
-- Teto da quantidade de uma embalagem por porção vendida: 1.000 un (ou kg/L).
-- Acima é dedo errado; a regra recusa antes com frase.
ALTER TABLE "ProdutoEmbalagem" ADD CONSTRAINT "ProdutoEmbalagem_quantidade_teto"
  CHECK ("quantidadeMilesimos" <= 1000000);
