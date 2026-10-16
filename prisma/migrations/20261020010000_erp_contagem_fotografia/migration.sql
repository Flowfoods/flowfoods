-- ERP 1.7 (revisão do Guardião) — a fotografia de uma contagem fechada é
-- imutável NO BANCO, não só no código.
--
-- ADITIVA: só gatilhos novos (nenhuma regra existente trocada). Uma contagem
-- que já não está ABERTA (aplicada, fechou sozinha, venceu, descartada) não
-- muda mais: nem o desfecho, nem quem fechou e quando, nem o valor
-- fotografado (`valorTotalCentavos` = estoque final do período, base do CMV
-- real da 2.3), nem os itens contados dela. Correção é contagem nova, como no
-- livro-razão. DELETE continua possível (limpeza administrativa/LGPD), igual
-- ao razão. Até SQL cru dentro do contexto do parceiro passa por aqui.

CREATE OR REPLACE FUNCTION "erp_contagem_fechada_imutavel"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'ABERTA' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION '[erp] contagem fechada não muda (fotografia): correção é uma contagem nova (Contagem_fechada_imutavel).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Contagem_fechada_imutavel" BEFORE UPDATE ON "Contagem"
  FOR EACH ROW EXECUTE FUNCTION "erp_contagem_fechada_imutavel"();

CREATE OR REPLACE FUNCTION "erp_item_de_contagem_fechada_imutavel"() RETURNS trigger AS $$
DECLARE
  s text;
BEGIN
  SELECT c."status"::text INTO s FROM "Contagem" c WHERE c."parceiroId" = NEW."parceiroId" AND c."id" = NEW."contagemId";
  IF s IS DISTINCT FROM 'ABERTA' THEN
    RAISE EXCEPTION '[erp] item de contagem fechada não muda (fotografia) (ContagemItem_da_fechada_imutavel).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ContagemItem_da_fechada_imutavel" BEFORE INSERT OR UPDATE ON "ContagemItem"
  FOR EACH ROW EXECUTE FUNCTION "erp_item_de_contagem_fechada_imutavel"();
