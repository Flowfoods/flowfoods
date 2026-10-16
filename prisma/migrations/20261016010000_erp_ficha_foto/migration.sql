-- ERP 1.2 — Ficha técnica: descrição e foto.
--
-- Só ADITIVA: quatro colunas opcionais em "FichaTecnica" e CHECKs que só
-- olham para elas. Nenhuma tabela nova (a foto é uma por ficha), então nada
-- muda no portão de tenant nem na RLS: as colunas herdam a política, o GRANT
-- e o trigger de parceiro imutável que a tabela já tem. Roda igual com o
-- usuário superusuário (produção hoje) ou com o dono não-superusuário.
--
-- O arquivo da foto fica no disco (<ERP_ARQUIVOS_DIR>/<parceiroId>/fichas/);
-- o banco guarda só o nome, que o servidor sorteia (32 hex) — nunca o nome
-- que veio do navegador —, o tipo conferido pelos bytes e o tamanho.

ALTER TABLE "FichaTecnica"
  ADD COLUMN "descricao" TEXT,
  ADD COLUMN "fotoArquivo" TEXT,
  ADD COLUMN "fotoMime" TEXT,
  ADD COLUMN "fotoBytes" INTEGER;

ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_descricao_curta"
  CHECK ("descricao" IS NULL OR char_length("descricao") <= 280);
ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_foto_nome"
  CHECK ("fotoArquivo" IS NULL OR "fotoArquivo" ~ '^[0-9a-f]{32}\.(jpg|png|webp)$');
ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_foto_tipo"
  CHECK ("fotoMime" IS NULL OR "fotoMime" IN ('image/jpeg', 'image/png', 'image/webp'));
ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_foto_tamanho"
  CHECK ("fotoBytes" IS NULL OR "fotoBytes" > 0);
-- Foto é tudo ou nada: nome, tipo e tamanho juntos.
ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_foto_inteira"
  CHECK (num_nulls("fotoArquivo", "fotoMime", "fotoBytes") IN (0, 3));
