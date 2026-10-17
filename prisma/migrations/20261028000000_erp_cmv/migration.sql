-- ERP 2.3 — Dois CMVs (compra e real). Decisões 164 e 167.
--
-- ADITIVA: uma coluna nova em "Contagem" (nenhuma tabela nova, então portão e RLS não mudam) e um CHECK.
-- O CMV em si é DERIVADO (notas + livro + retrato do fechamento de estoque) e a fotografia do DRE usa as
-- colunas que já tinha ("versaoDaConta" = 2 e "chave" livre nas linhas), então nada mais é preciso.
--
-- "itensSemPreco" é gravada no MESMO UPDATE que fecha a abertura ou o fechamento de estoque (a contagem
-- fechada é imutável por gatilho: depois de fechada nada a altera). ADD COLUMN não dispara gatilho de UPDATE.
-- Contagem de antes da 2.3 fica com NULL = "não registrado" (nunca um zero inventado).
--
-- Segura para superusuário e para dono não-superusuário com ou sem FORCE RLS: nenhum passo lê tabela de tenant.
-- O CHECK entra NOT VALID e logo se tenta VALIDATE; se algum dia alguma linha o violar, a migration NÃO falha:
-- avisa e o CHECK segue NOT VALID (vale para toda escrita nova). `npm run erp:conferir-migracao` lista a pendência.

ALTER TABLE "Contagem" ADD COLUMN "itensSemPreco" INTEGER;

ALTER TABLE "Contagem" ADD CONSTRAINT "Contagem_itensSemPreco_nao_negativo"
  CHECK ("itensSemPreco" IS NULL OR "itensSemPreco" >= 0) NOT VALID;

DO $$
BEGIN
  ALTER TABLE "Contagem" VALIDATE CONSTRAINT "Contagem_itensSemPreco_nao_negativo";
EXCEPTION WHEN check_violation THEN
  RAISE WARNING 'ERP 2.3: o CHECK Contagem_itensSemPreco_nao_negativo ficou NOT VALID (linha antiga em "Contagem", corrija e rode VALIDATE CONSTRAINT); vale para toda escrita nova.';
END $$;
