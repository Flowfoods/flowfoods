-- ERP I.2a (veto do Guardião, itens baixos): dois gatilhos a mais, ADITIVOS e sem dado novo (só função e gatilho; nenhuma tabela,
-- coluna, índice, RLS ou GRANT muda; nenhum SELECT roda na migration, então vale nos três perfis sem papel especial).
--
-- 1. O conjunto de metas por categoria NÃO nasce com vigência retroativa: o INSERT de um conjunto com `vigenteDesde` anterior ao do
--    conjunto mais novo do MESMO escopo (rede ou loja) é recusado. Sem isso, um conjunto "do passado" entraria no meio da história e
--    mudaria a meta efetiva de períodos que já tinham fechado com outra. (O mesmo dia já é barrado pelo índice único.)
CREATE OR REPLACE FUNCTION "erp_meta_cmv_conjunto_sem_retroativo"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "MetaCmvConjunto" c
    WHERE c."parceiroId" = NEW."parceiroId" AND c."lojaId" IS NOT DISTINCT FROM NEW."lojaId" AND c."vigenteDesde" > NEW."vigenteDesde"
  ) THEN
    RAISE EXCEPTION '[erp] o conjunto de metas por categoria não nasce com vigência anterior à do mais novo do escopo (MetaCmvConjunto_sem_retroativo).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "MetaCmvConjunto_sem_retroativo" ON "MetaCmvConjunto";
CREATE TRIGGER "MetaCmvConjunto_sem_retroativo" BEFORE INSERT ON "MetaCmvConjunto"
  FOR EACH ROW EXECUTE FUNCTION "erp_meta_cmv_conjunto_sem_retroativo"();

-- 2. A contagem NÃO fecha com itens de retrato soltos: se existe linha em `ContagemRetratoItem` para ela, o fechamento tem de trazer
--    `retratoGravadoEm` (e então a soma confere, como antes). Itens soltos sem o marcador deixariam o retrato inexistente para o
--    CMV real e existente para quem lê a tabela.
CREATE OR REPLACE FUNCTION "erp_contagem_retrato_confere"() RETURNS trigger AS $$
DECLARE
  soma bigint;
BEGIN
  IF NEW."retratoGravadoEm" IS NOT NULL AND OLD."retratoGravadoEm" IS NULL THEN
    IF NEW."status" <> 'FECHADA' OR NEW."valorTotalCentavos" IS NULL THEN
      RAISE EXCEPTION '[erp] o retrato por insumo só se registra na mesma transação que fecha a contagem, com o valor total (Contagem_retrato_confere).' USING ERRCODE = 'check_violation';
    END IF;
    SELECT coalesce(sum(r."valorCentavos"), 0) INTO soma FROM "ContagemRetratoItem" r WHERE r."parceiroId" = NEW."parceiroId" AND r."contagemId" = NEW."id";
    IF soma <> NEW."valorTotalCentavos" THEN
      RAISE EXCEPTION '[erp] a soma do retrato por insumo (% centavos) não é o valor total da contagem (% centavos) (Contagem_retrato_confere).', soma, NEW."valorTotalCentavos" USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW."status" = 'FECHADA' AND OLD."status" <> 'FECHADA' AND NEW."retratoGravadoEm" IS NULL THEN
    IF EXISTS (SELECT 1 FROM "ContagemRetratoItem" r WHERE r."parceiroId" = NEW."parceiroId" AND r."contagemId" = NEW."id") THEN
      RAISE EXCEPTION '[erp] a contagem tem itens de retrato por insumo e não pode fechar sem registrar `retratoGravadoEm` (Contagem_retrato_confere).' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
