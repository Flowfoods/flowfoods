-- ERP I.2b — CMV real por categoria, compra × real, evolução, matriz e meta total por loja. Decisões 286 a 298.
--
-- ADITIVA: UMA coluna anulável em "MetaCmvConjunto" ("metaTotalBp": a meta total do CMV da loja que personaliza o conjunto) e um CHECK.
-- Nada é lido, movido nem apagado; nenhuma linha é criada nem muda (todo conjunto existente fica com a coluna nula = "sem total próprio:
-- vale o total da rede", que é exatamente o que valia até aqui). O CMV real por categoria é DERIVADO (retrato por insumo, livro e notas):
-- não há tabela nova.
--
-- Segura para superusuário e para dono NÃO-superusuário, com ou sem FORCE RLS: nenhum passo lê tabela de tenant sob RLS. O CHECK entra
-- NOT VALID e logo se tenta o VALIDATE (só lê o catálogo e a tabela fora da RLS do papel); linha antiga que o viole não reprova a
-- migration, deixa o CHECK NOT VALID e avisa (WARNING). Como a coluna nasce nula, a validação nunca falha em dado existente.
-- Depois do deploy, `npm run erp:conferir-migracao` confere a coluna e o CHECK.

ALTER TABLE "MetaCmvConjunto" ADD COLUMN "metaTotalBp" INTEGER;

-- O total próprio é da LOJA que personaliza (o da rede é a meta do CMV do DRE, uma fonte só), de 0 a 100,00 %; a loja que "segue a rede" não o tem.
ALTER TABLE "MetaCmvConjunto" ADD CONSTRAINT "MetaCmvConjunto_total_proprio"
  CHECK ("metaTotalBp" IS NULL OR ("metaTotalBp" BETWEEN 0 AND 10000 AND "lojaId" IS NOT NULL AND NOT "segueARede")) NOT VALID;

DO $$
BEGIN
  BEGIN
    ALTER TABLE "MetaCmvConjunto" VALIDATE CONSTRAINT "MetaCmvConjunto_total_proprio";
  EXCEPTION WHEN check_violation THEN
    RAISE WARNING 'ERP I.2b: o CHECK MetaCmvConjunto_total_proprio ficou NOT VALID (linha antiga em MetaCmvConjunto, corrija e rode VALIDATE CONSTRAINT); vale para toda escrita nova.';
  END;
END $$;
