-- ERP F4 — fotos de apoio da ficha (plano: "Fotos da ficha" e "Complemento prioritário — prévia e persistência").
--
-- A foto que a ficha já tem ("fotoArquivo") CONTINUA sendo a principal: nada é migrado, nenhuma foto precisa ser
-- reenviada. As de apoio (detalhe do prato, corte, montagem, etapas) vão numa lista na própria ficha, na ordem, com
-- legenda opcional: [{ "arquivo", "mime", "bytes", "legenda" }]. Na ficha (e não numa tabela nova) porque a ficha já
-- tem a trava de versão ("atualizadoEm"): duas telas mexendo nas fotos ao mesmo tempo dão conflito, e um envio
-- atrasado não troca a capa nem devolve uma escolha antiga. Só ADITIVA.

ALTER TABLE "FichaTecnica" ADD COLUMN "fotosApoio" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_fotos_apoio_lista" CHECK (
  jsonb_typeof("fotosApoio") = 'array' AND jsonb_array_length("fotosApoio") <= 8
);
