-- ERP 1.4 — Validade por conservação na ficha técnica (e regras no insumo).
--
-- O Insumo já tinha, desde a 0.1, a conservação principal e a validade em
-- MINUTOS por conservação (seco/ambiente, pista fria, refrigerado,
-- congelado). A ficha técnica ganha o MESMO modelo: o item aceita uma
-- conservação quando tem validade nela, e a principal é uma das aceitas. Na
-- ficha a principal é opcional (nula = validade não informada).
--
-- Só ADITIVA: cinco colunas opcionais em "FichaTecnica" e CHECKs que só olham
-- para elas. Nenhuma tabela nova: portão, RLS, GRANT e o trigger de parceiro
-- imutável continuam valendo para as colunas novas. Roda igual com o usuário
-- superusuário (produção hoje) ou com o dono não-superusuário (quem roda a
-- migration é o dono da tabela).
--
-- No Insumo, os CHECKs novos entram NOT VALID: valem para toda escrita daqui
-- em diante sem reprovar a migration por alguma linha antiga gravada por fora
-- (até a 1.4 nenhuma tela gravava validade; as colunas estão nulas).

ALTER TABLE "FichaTecnica"
  ADD COLUMN "conservacao" "Conservacao",
  ADD COLUMN "validadeSecoMin" INTEGER,
  ADD COLUMN "validadePistaFriaMin" INTEGER,
  ADD COLUMN "validadeRefrigeradoMin" INTEGER,
  ADD COLUMN "validadeCongeladoMin" INTEGER;

-- 1 minuto a 730 dias (1.051.200 minutos) em cada conservação.
ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_validades_faixa" CHECK (
  ("validadeSecoMin" IS NULL OR "validadeSecoMin" BETWEEN 1 AND 1051200) AND
  ("validadePistaFriaMin" IS NULL OR "validadePistaFriaMin" BETWEEN 1 AND 1051200) AND
  ("validadeRefrigeradoMin" IS NULL OR "validadeRefrigeradoMin" BETWEEN 1 AND 1051200) AND
  ("validadeCongeladoMin" IS NULL OR "validadeCongeladoMin" BETWEEN 1 AND 1051200)
);

-- Sem principal, nenhuma validade; com principal, ela tem validade.
ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_validade_principal" CHECK (
  ("conservacao" IS NULL AND num_nonnulls("validadeSecoMin", "validadePistaFriaMin", "validadeRefrigeradoMin", "validadeCongeladoMin") = 0)
  OR ("conservacao" = 'SECO' AND "validadeSecoMin" IS NOT NULL)
  OR ("conservacao" = 'PISTA_FRIA' AND "validadePistaFriaMin" IS NOT NULL)
  OR ("conservacao" = 'REFRIGERADO' AND "validadeRefrigeradoMin" IS NOT NULL)
  OR ("conservacao" = 'CONGELADO' AND "validadeCongeladoMin" IS NOT NULL)
);

-- Insumo: a mesma faixa e, havendo alguma validade, a principal tem a sua.
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_validades_faixa" CHECK (
  ("validadeSecoMin" IS NULL OR "validadeSecoMin" <= 1051200) AND
  ("validadePistaFriaMin" IS NULL OR "validadePistaFriaMin" <= 1051200) AND
  ("validadeRefrigeradoMin" IS NULL OR "validadeRefrigeradoMin" <= 1051200) AND
  ("validadeCongeladoMin" IS NULL OR "validadeCongeladoMin" <= 1051200)
) NOT VALID;

ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_validade_principal" CHECK (
  num_nonnulls("validadeSecoMin", "validadePistaFriaMin", "validadeRefrigeradoMin", "validadeCongeladoMin") = 0
  OR ("conservacao" = 'SECO' AND "validadeSecoMin" IS NOT NULL)
  OR ("conservacao" = 'PISTA_FRIA' AND "validadePistaFriaMin" IS NOT NULL)
  OR ("conservacao" = 'REFRIGERADO' AND "validadeRefrigeradoMin" IS NOT NULL)
  OR ("conservacao" = 'CONGELADO' AND "validadeCongeladoMin" IS NOT NULL)
) NOT VALID;
