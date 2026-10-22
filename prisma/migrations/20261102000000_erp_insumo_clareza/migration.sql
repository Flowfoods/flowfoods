-- ERP I.1b — Clareza do cadastro de insumos: tipo "Material de limpeza e uso" e marca de referência. Decisões 259 a 270.
--
-- ADITIVA: um valor novo no enum "InsumoTipo" e UMA coluna nova, anulável, em "Insumo". Nada é lido, movido, reescrito nem
-- apagado: nenhum insumo antigo muda de tipo, de custo, de conservação nem de prazo (o que já está gravado como "validade
-- depois de aberto" continua valendo, só mudou o nome na tela). Nenhuma nota, movimento, despesa ou conta nasce aqui.
--
-- Segura para superusuário e para dono NÃO-superusuário, com ou sem FORCE RLS: nenhum passo lê tabela de tenant (lição da
-- 2.1: o dono com FORCE RLS enxerga 0 linhas). O CHECK da coluna nova entra NOT VALID e logo se tenta o VALIDATE (só lê o
-- que o dono enxerga); como a coluna nasce toda nula, a validação nunca tem o que reprovar — mas, se reprovar, a migration
-- avisa (WARNING) e deixa o CHECK NOT VALID, que já vale para toda escrita nova. O valor novo do enum só pode ser USADO depois
-- do commit; esta migration não o usa.

ALTER TYPE "InsumoTipo" ADD VALUE IF NOT EXISTS 'MATERIAL';

ALTER TABLE "Insumo" ADD COLUMN "marcaReferencia" TEXT;

ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_marcaReferencia_curta"
  CHECK ("marcaReferencia" IS NULL OR (char_length("marcaReferencia") BETWEEN 1 AND 80 AND "marcaReferencia" = btrim("marcaReferencia"))) NOT VALID;

DO $$
BEGIN
  BEGIN
    ALTER TABLE "Insumo" VALIDATE CONSTRAINT "Insumo_marcaReferencia_curta";
  EXCEPTION WHEN check_violation THEN
    RAISE WARNING 'ERP I.1b: o CHECK Insumo_marcaReferencia_curta ficou NOT VALID (linha antiga em Insumo, corrija e rode VALIDATE CONSTRAINT); vale para toda escrita nova.';
  END;
END $$;
