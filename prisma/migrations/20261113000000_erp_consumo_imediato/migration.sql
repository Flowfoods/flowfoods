-- ERP F4 — "Consumo imediato" na ficha (pedido de Rodolfo; plano: "Prioridade da ficha — opção Consumo imediato").
--
-- Não é uma quinta conservação nem um prazo inventado: é a indicação de que o preparo sai da cozinha para o cliente
-- sem ser guardado. Por isso convive só com a validade NÃO informada (CHECK): marcar consumo imediato e dizer onde
-- guarda é contradição. Só ADITIVA: toda ficha existente fica como está (false).
--   - "FichaTecnica"."consumoImediato": a indicação na ficha.
--   - "OrdemProducao"."consumoImediato": a fotografia no lote concluído (o lote concluído não muda; a ficha pode
--     mudar depois). ADD COLUMN com DEFAULT não dispara o gatilho de imutabilidade.
-- GRANT é da tabela inteira: a coluna nova já vale para o papel do tenant.

ALTER TABLE "FichaTecnica" ADD COLUMN "consumoImediato" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_consumo_imediato_sem_validade" CHECK (
  NOT "consumoImediato"
  OR ("conservacao" IS NULL AND "validadeSecoMin" IS NULL AND "validadePistaFriaMin" IS NULL AND "validadeRefrigeradoMin" IS NULL AND "validadeCongeladoMin" IS NULL)
);

ALTER TABLE "OrdemProducao" ADD COLUMN "consumoImediato" BOOLEAN NOT NULL DEFAULT false;
