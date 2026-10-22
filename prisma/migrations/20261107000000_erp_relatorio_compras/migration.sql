-- ERP L.2 — relatórios de compras: dois índices ADITIVOS para as outras duas bases de data (emissão da nota fiscal e dia do
-- lançamento). A base "entrada" já tem o seu (`NotaEntrada_parceiroId_lojaId_entradaEm_idx`, da fundação).
--
-- Só índice: nenhuma tabela, coluna, CHECK, gatilho ou política nova, e nenhum SELECT/DML (nada a conferir sob RLS no passo da
-- migration). Roda igual nos 3 perfis do banco (superusuário, dono com FORCE RLS, dono sem RLS): o dono da tabela pode criar
-- índice nela. `IF NOT EXISTS` deixa reaplicar sem erro. Reverter = DROP INDEX dos dois nomes (nada depende deles).

CREATE INDEX IF NOT EXISTS "NotaEntrada_parceiroId_lojaId_emitidaEm_idx" ON "NotaEntrada"("parceiroId", "lojaId", "emitidaEm");
CREATE INDEX IF NOT EXISTS "NotaEntrada_parceiroId_lojaId_lancadaEm_idx" ON "NotaEntrada"("parceiroId", "lojaId", "lancadaEm");
