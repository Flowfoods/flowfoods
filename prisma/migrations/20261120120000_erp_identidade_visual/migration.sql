-- Aditiva: referências locais geradas no servidor. Nenhuma URL externa ou dado histórico é alterado.
ALTER TABLE "Marca" ADD COLUMN "logoArquivo" TEXT;
ALTER TABLE "UsuarioErp" ADD COLUMN "fotoArquivo" TEXT;
ALTER TABLE "User" ADD COLUMN "fotoArquivo" TEXT;

ALTER TABLE "Marca" ADD CONSTRAINT "Marca_logoArquivo_formato"
  CHECK ("logoArquivo" IS NULL OR "logoArquivo" ~ '^[0-9a-f]{32}\.(jpg|png|webp)$');
ALTER TABLE "UsuarioErp" ADD CONSTRAINT "UsuarioErp_fotoArquivo_formato"
  CHECK ("fotoArquivo" IS NULL OR "fotoArquivo" ~ '^[0-9a-f]{32}\.(jpg|png|webp)$');
ALTER TABLE "User" ADD CONSTRAINT "User_fotoArquivo_formato"
  CHECK ("fotoArquivo" IS NULL OR "fotoArquivo" ~ '^[0-9a-f]{32}\.(jpg|png|webp)$');

-- Marca continua sob a RLS existente. UsuarioErp e User continuam fora do papel erp_tenant.
