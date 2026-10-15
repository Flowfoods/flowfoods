-- ERP 0.4 — Permissões: perfis (base em código + próprios do parceiro),
-- ajuste por pessoa, setores e lojas de cada pessoa.
--
-- Só ADITIVA: 2 enums, 1 tabela nova, 7 colunas novas no vínculo
-- (`AcessoParceiro`), índices, FKs e CHECKs. Nada existente muda de tipo nem
-- some. Os vínculos que já existem (0.3) recebem o perfil base GERENTE com a
-- rede inteira: continuam fazendo o que já faziam (ver e cadastrar insumo), sem
-- ganhar "cuidar da equipe" — quem vira dono é decisão do nível 1 (decisão 40).
--
-- `PerfilAcesso` fica FORA do tenant, junto das credenciais (decisão 39): é
-- lido na validação da sessão, a cada requisição, antes do contexto do
-- parceiro. Segue a trava do módulo `src/lib/erp/credenciais.ts` (prisma do
-- portal recusa; teste-guarda reprova uso fora do módulo) e o papel
-- `erp_tenant` NÃO recebe GRANT nela (o bloco do fim revoga, condicional, no
-- padrão das migrations 0.2/0.3).
--
-- Segura nos dois cenários de produção (superusuário e dono
-- não-superusuário): ADD COLUMN/CREATE TABLE/INDEX/FK/CHECK só exigem ser dono
-- das tabelas, e o bloco do papel só age se o papel existir.

-- CreateEnum
CREATE TYPE "PerfilBase" AS ENUM ('DONO', 'GERENTE', 'OPERADOR');

-- CreateEnum
CREATE TYPE "Setor" AS ENUM ('COZINHA', 'SALAO', 'ADMINISTRATIVO', 'ESTOQUE', 'CAIXA', 'MOTOBOY', 'FREELANCER', 'COMPRAS', 'MARKETING_CRM', 'GERENCIA');

-- AlterTable
ALTER TABLE "AcessoParceiro" ADD COLUMN     "lojaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "perfilBase" "PerfilBase",
ADD COLUMN     "perfilId" TEXT,
ADD COLUMN     "permissoesExtras" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "permissoesRemovidas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "redeInteira" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "setores" "Setor"[] DEFAULT ARRAY[]::"Setor"[];

-- CreateTable
CREATE TABLE "PerfilAcesso" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "base" "PerfilBase" NOT NULL,
    "permissoes" TEXT[],
    "setores" "Setor"[] DEFAULT ARRAY[]::"Setor"[],
    "catalogoVersao" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerfilAcesso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PerfilAcesso_parceiroId_id_key" ON "PerfilAcesso"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PerfilAcesso_parceiroId_nome_key" ON "PerfilAcesso"("parceiroId", "nome");

-- CreateIndex
CREATE INDEX "AcessoParceiro_parceiroId_perfilId_idx" ON "AcessoParceiro"("parceiroId", "perfilId");

-- AddForeignKey (composta: o perfil é do MESMO parceiro do vínculo)
ALTER TABLE "AcessoParceiro" ADD CONSTRAINT "AcessoParceiro_parceiroId_perfilId_fkey" FOREIGN KEY ("parceiroId", "perfilId") REFERENCES "PerfilAcesso"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilAcesso" ADD CONSTRAINT "PerfilAcesso_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Vínculos que já existiam: gerente, rede inteira (o que já podiam, sem cuidar da equipe).
UPDATE "AcessoParceiro" SET "perfilBase" = 'GERENTE' WHERE "perfilBase" IS NULL AND "perfilId" IS NULL;

-- Regras que o banco também segura.
-- Um perfil só: base OU próprio.
ALTER TABLE "AcessoParceiro" ADD CONSTRAINT "AcessoParceiro_um_perfil" CHECK (num_nonnulls("perfilBase", "perfilId") = 1);
-- Rede inteira e lista de lojas não convivem; sem rede, pelo menos uma loja.
ALTER TABLE "AcessoParceiro" ADD CONSTRAINT "AcessoParceiro_lojas" CHECK ("redeInteira" = (coalesce(cardinality("lojaIds"), 0) = 0));
ALTER TABLE "PerfilAcesso" ADD CONSTRAINT "PerfilAcesso_nome_preenchido" CHECK (length(btrim("nome")) >= 2);
ALTER TABLE "PerfilAcesso" ADD CONSTRAINT "PerfilAcesso_catalogo" CHECK ("catalogoVersao" >= 1);

-- O papel do tenant NÃO alcança o perfil (credencial). Condicional, no padrão
-- da 0.3: só se o papel existir; sem privilégio, avisa e segue.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    RAISE NOTICE 'ERP 0.4: papel erp_tenant não existe; nada a revogar.';
    RETURN;
  END IF;
  BEGIN
    EXECUTE 'REVOKE ALL ON "PerfilAcesso" FROM erp_tenant';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ERP 0.4: % não pôde revogar PerfilAcesso de erp_tenant (sem privilégio); o papel não recebeu GRANT nela.', current_user;
  END;
END $$;
