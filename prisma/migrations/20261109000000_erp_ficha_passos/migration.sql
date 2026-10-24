-- ERP N.4 — modo de preparo em ETAPAS numeradas na ficha técnica.
--
-- Uma coluna ADITIVA em "FichaTecnica": a lista ordenada de etapas (texto de cada uma). Vazia por padrão: nenhuma ficha
-- existente muda. O texto antigo ("modoPreparo") fica intocado, inteiro, e continua aparecendo como "texto anterior" até
-- a pessoa decidir o que fazer com ele: nada é dividido nem reescrito por esta migration.
-- CHECK: no máximo 40 etapas (o servidor recusa antes, com a frase; o banco é o seguro).
--
-- Sem SELECT/DML: nada a conferir sob RLS no passo da migration. Roda igual nos 3 perfis do banco.
-- Reverter = DROP CONSTRAINT + DROP COLUMN (nada mais depende dela).

ALTER TABLE "FichaTecnica" ADD COLUMN IF NOT EXISTS "passosPreparo" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "FichaTecnica" DROP CONSTRAINT IF EXISTS "FichaTecnica_passosPreparo_limite";
ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_passosPreparo_limite" CHECK (cardinality("passosPreparo") <= 40);
