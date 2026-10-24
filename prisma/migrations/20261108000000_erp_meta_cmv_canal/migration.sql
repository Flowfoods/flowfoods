-- ERP N.2 — META DE CMV por canal (decisão de Rodolfo: precificar pela meta de CMV; margem vira resultado).
--
-- Uma coluna NULA e ADITIVA em "CanalConfig" (a linha do parceiro por canal), ao lado da margem-alvo antiga, que fica
-- intocada: nenhuma margem é convertida em meta, nenhum preço é reescrito. Nula = sem meta (o canal fica "sem dados" no
-- farol e sem sugestão). CHECK: maior que 0 % e menor que 100 % do preço (1 a 9.999 pontos-base).
--
-- Sem SELECT/DML: nada a conferir sob RLS no passo da migration; a política da tabela já cobre a coluna nova. Roda igual
-- nos 3 perfis do banco. Reverter = DROP CONSTRAINT + DROP COLUMN (nada mais depende dela).

ALTER TABLE "CanalConfig" ADD COLUMN IF NOT EXISTS "metaCmvPadraoBp" INTEGER;
ALTER TABLE "CanalConfig" DROP CONSTRAINT IF EXISTS "CanalConfig_metaCmvPadraoBp_faixa";
ALTER TABLE "CanalConfig" ADD CONSTRAINT "CanalConfig_metaCmvPadraoBp_faixa" CHECK ("metaCmvPadraoBp" IS NULL OR ("metaCmvPadraoBp" >= 1 AND "metaCmvPadraoBp" <= 9999));
