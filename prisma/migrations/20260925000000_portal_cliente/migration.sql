-- CreateEnum
CREATE TYPE "PortalMarcacao" AS ENUM ('NAO_TENHO', 'NAO_SEI', 'AGORA_NAO');

-- CreateTable
CREATE TABLE "PortalCliente" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "questionario" TEXT NOT NULL,
    "finalizadoEm" TIMESTAMP(3),
    "ultimaAtividadeEm" TIMESTAMP(3),
    "avisoEnviadoEm" TIMESTAMP(3),
    "avisoErro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalResposta" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "texto" TEXT,
    "marcacao" "PortalMarcacao",
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalResposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalArquivo" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "bloco" TEXT NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "mime" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalArquivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalCliente_slug_key" ON "PortalCliente"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PortalCliente_token_key" ON "PortalCliente"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PortalResposta_clienteId_itemId_key" ON "PortalResposta"("clienteId", "itemId");

-- CreateIndex
CREATE INDEX "PortalArquivo_clienteId_itemId_idx" ON "PortalArquivo"("clienteId", "itemId");

-- AddForeignKey
ALTER TABLE "PortalResposta" ADD CONSTRAINT "PortalResposta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "PortalCliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalArquivo" ADD CONSTRAINT "PortalArquivo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "PortalCliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Cliente ativo: Grupo Valentin's. O token nasce aqui, no banco, de
-- gen_random_uuid() (nativo desde o Postgres 13, sem extensão): 32 hexadecimais
-- aleatórios que não passam por arquivo, chat nem log. O Rodolfo copia o link
-- pronto em /rodolfo/portal.
INSERT INTO "PortalCliente" ("id", "nome", "slug", "token", "questionario")
VALUES ('portal_valentins', 'Grupo Valentin''s', 'valentins', replace(gen_random_uuid()::text, '-', ''), 'valentins')
ON CONFLICT ("slug") DO NOTHING;
