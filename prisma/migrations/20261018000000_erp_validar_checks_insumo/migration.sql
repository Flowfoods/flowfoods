-- ERP 1.5 (herança a da 1.4) — os CHECKs de validade do Insumo passam a valer
-- também para as linhas antigas.
--
-- Na 1.4 eles entraram NOT VALID (valiam para toda escrita nova, sem reprovar
-- a migration por alguma linha gravada por fora). Conferido: nenhuma tela
-- gravava validade antes da 1.4 e, desde ela, toda escrita passa pelos CHECKs
-- — então as linhas atuais passam. VALIDATE só LÊ a tabela (trava SHARE UPDATE
-- EXCLUSIVE: leituras e escritas seguem durante a conferência).
--
-- Se alguma linha violar, a migration falha com o nome do CHECK e nada muda:
-- corrigir a linha (a validade da conservação principal) e rodar de novo.
-- Roda igual como superusuário ou como dono não-superusuário da tabela.

ALTER TABLE "Insumo" VALIDATE CONSTRAINT "Insumo_validades_faixa";
ALTER TABLE "Insumo" VALIDATE CONSTRAINT "Insumo_validade_principal";
