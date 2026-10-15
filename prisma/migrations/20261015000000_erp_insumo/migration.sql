-- ERP Barney — fatia vertical (Passo zero): ParceiroFlow + Insumo.
-- Só aditiva, como todas as migrations deste repo.
-- CreateEnum
CREATE TYPE "ParceiroStatus" AS ENUM ('RASCUNHO', 'ATIVO', 'SUSPENSO');

-- CreateEnum
CREATE TYPE "UnidadeBase" AS ENUM ('KG', 'L', 'UN');

-- CreateTable
CREATE TABLE "ParceiroFlow" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ParceiroStatus" NOT NULL DEFAULT 'RASCUNHO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParceiroFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insumo" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "unidade" "UnidadeBase" NOT NULL,
    "conteudoMilesimos" INTEGER NOT NULL,
    "precoEmbalagemCentavos" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Insumo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParceiroFlow_slug_key" ON "ParceiroFlow"("slug");

-- CreateIndex
CREATE INDEX "Insumo_parceiroId_criadoEm_idx" ON "Insumo"("parceiroId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Insumo_parceiroId_nome_key" ON "Insumo"("parceiroId", "nome");

-- AddForeignKey
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Inteiros positivos garantidos pelo banco, não só pela tela: quantidade em
-- milésimos e dinheiro em centavos nunca chegam zerados nem negativos.
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_conteudoMilesimos_positivo" CHECK ("conteudoMilesimos" > 0);
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_precoEmbalagemCentavos_naoneg" CHECK ("precoEmbalagemCentavos" >= 0);
