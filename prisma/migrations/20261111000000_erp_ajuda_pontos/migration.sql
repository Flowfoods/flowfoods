-- ERP · Ajuda contextual por ponto (prioridade nº 1 de 23/10/2026): quando cada
-- card de ajuda abriu sozinho pela última vez e quais a pessoa pediu para não
-- mostrar de novo.
--
-- Só ADITIVA: 1 coluna nova, com padrão vazio, na tabela da 0.6. Nada muda nas
-- linhas existentes (quem já tinha preferência fica com a lista vazia = todo
-- ponto elegível). A tabela segue FORA do tenant, sem GRANT do papel
-- `erp_tenant` (o REVOKE da 0.6 vale para a tabela toda, coluna nova inclusa).
--
-- Itens: "chave.ponto=DIA" (dia corrido no horário de Brasília) ou
-- "chave.ponto=x" (não mostrar novamente). O servidor só grava ponto que existe
-- no registro (lista branca) e um item por ponto; o banco segura o teto, como
-- em "fechadas": no máximo 300 itens de até 120 caracteres.

ALTER TABLE "PreferenciaErp" ADD COLUMN "pontos" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "PreferenciaErp" ADD CONSTRAINT "PreferenciaErp_pontos_limite"
  CHECK ("pontos" IS NULL OR (cardinality("pontos") <= 300 AND "erp_itens_ate"("pontos", 120)));
