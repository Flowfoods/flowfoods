-- 3B: configuração de faixas no mesmo escopo e nas mesmas proteções de CanalConfig.
-- Colunas sem default e sem backfill: meta, taxa e registros anteriores permanecem intactos.
ALTER TABLE "CanalConfig"
  ADD COLUMN "farolABp" INTEGER,
  ADD COLUMN "farolBBp" INTEGER,
  ADD COLUMN "farolCBp" INTEGER,
  ADD COLUMN "farolDBp" INTEGER;

ALTER TABLE "CanalConfig" ADD CONSTRAINT "CanalConfig_farol_conjunto_valido" CHECK (
  ("farolABp" IS NULL AND "farolBBp" IS NULL AND "farolCBp" IS NULL AND "farolDBp" IS NULL)
  OR
  ("farolABp" IS NOT NULL AND "farolBBp" IS NOT NULL AND "farolCBp" IS NOT NULL AND "farolDBp" IS NOT NULL
    AND "farolABp" >= 0 AND "farolABp" < "farolBBp" AND "farolBBp" < "farolCBp"
    AND "farolCBp" < "farolDBp" AND "farolDBp" <= 2000000000)
);
