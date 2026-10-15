-- ERP 0.3 — Login das pessoas dos parceiros (senha + entrar com o rosto).
--
-- Só ADITIVA: 3 enums e 7 tabelas novas; nada existente muda.
--
-- Estas tabelas ficam FORA do tenant de propósito (decisão 35): e-mail, senha,
-- link de primeiro acesso, rosto (chave pública WebAuthn) e sessão precisam ser
-- lidos ANTES de saber o parceiro — no login. Então:
--   - não entram na RLS nem recebem GRANT do papel `erp_tenant` (e o bloco do
--     fim REVOGA, por garantia, qualquer privilégio herdado de default);
--   - só `src/lib/erp/credenciais.ts` toca nelas (o prisma do portal recusa em
--     runtime e o teste-guarda reprova uso fora do módulo);
--   - o que muda no acesso (criar, desativar, novo link, senha definida, rosto
--     ativado/removido) é gravado no `HistoricoAlteracao` DO parceiro.
--
-- Segura para produção nos dois cenários da 0.2 (superusuário e dono
-- não-superusuário): CREATE TABLE/INDEX/FK/CHECK só exigem ser dono do schema,
-- e o bloco condicional só mexe no papel se ele existir e quem roda puder.

-- CreateEnum
CREATE TYPE "AcessoStatus" AS ENUM ('ATIVO', 'DESATIVADO');

-- CreateEnum
CREATE TYPE "MetodoEntrada" AS ENUM ('SENHA', 'ROSTO');

-- CreateEnum
CREATE TYPE "DesafioTipo" AS ENUM ('REGISTRO', 'ENTRADA');

-- CreateTable
CREATE TABLE "UsuarioErp" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "senhaHash" TEXT,
    "senhaDefinidaEm" TIMESTAMP(3),
    "ultimoLogin" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsuarioErp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcessoParceiro" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "status" "AcessoStatus" NOT NULL DEFAULT 'ATIVO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcessoParceiro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConviteAcesso" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "revogadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConviteAcesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasskeyErp" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "credencialId" TEXT NOT NULL,
    "chavePublica" BYTEA NOT NULL,
    "contador" BIGINT NOT NULL DEFAULT 0,
    "transportes" TEXT[],
    "aparelho" TEXT NOT NULL,
    "sincronizada" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUsoEm" TIMESTAMP(3),

    CONSTRAINT "PasskeyErp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesafioWebauthn" (
    "id" TEXT NOT NULL,
    "desafio" TEXT NOT NULL,
    "tipo" "DesafioTipo" NOT NULL,
    "usuarioId" TEXT,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesafioWebauthn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessaoErp" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "parceiroId" TEXT,
    "metodo" "MetodoEntrada" NOT NULL,
    "ip" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "encerradaEm" TIMESTAMP(3),

    CONSTRAINT "SessaoErp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TentativaEntradaErp" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "ip" TEXT NOT NULL,
    "metodo" "MetodoEntrada" NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "motivo" TEXT NOT NULL,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TentativaEntradaErp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioErp_email_key" ON "UsuarioErp"("email");

-- CreateIndex
CREATE INDEX "AcessoParceiro_usuarioId_idx" ON "AcessoParceiro"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "AcessoParceiro_parceiroId_usuarioId_key" ON "AcessoParceiro"("parceiroId", "usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "ConviteAcesso_tokenHash_key" ON "ConviteAcesso"("tokenHash");

-- CreateIndex
CREATE INDEX "ConviteAcesso_usuarioId_criadoEm_idx" ON "ConviteAcesso"("usuarioId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "PasskeyErp_credencialId_key" ON "PasskeyErp"("credencialId");

-- CreateIndex
CREATE INDEX "PasskeyErp_usuarioId_idx" ON "PasskeyErp"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "DesafioWebauthn_desafio_key" ON "DesafioWebauthn"("desafio");

-- CreateIndex
CREATE INDEX "DesafioWebauthn_expiraEm_idx" ON "DesafioWebauthn"("expiraEm");

-- CreateIndex
CREATE UNIQUE INDEX "SessaoErp_tokenHash_key" ON "SessaoErp"("tokenHash");

-- CreateIndex
CREATE INDEX "SessaoErp_usuarioId_idx" ON "SessaoErp"("usuarioId");

-- CreateIndex
CREATE INDEX "TentativaEntradaErp_email_criadoEm_idx" ON "TentativaEntradaErp"("email", "criadoEm");

-- CreateIndex
CREATE INDEX "TentativaEntradaErp_ip_criadoEm_idx" ON "TentativaEntradaErp"("ip", "criadoEm");

-- AddForeignKey
ALTER TABLE "AcessoParceiro" ADD CONSTRAINT "AcessoParceiro_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcessoParceiro" ADD CONSTRAINT "AcessoParceiro_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "UsuarioErp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConviteAcesso" ADD CONSTRAINT "ConviteAcesso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "UsuarioErp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConviteAcesso" ADD CONSTRAINT "ConviteAcesso_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasskeyErp" ADD CONSTRAINT "PasskeyErp_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "UsuarioErp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesafioWebauthn" ADD CONSTRAINT "DesafioWebauthn_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "UsuarioErp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoErp" ADD CONSTRAINT "SessaoErp_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "UsuarioErp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoErp" ADD CONSTRAINT "SessaoErp_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Regras que o banco também segura.
ALTER TABLE "UsuarioErp" ADD CONSTRAINT "UsuarioErp_email_minusculo" CHECK ("email" = lower("email") AND "email" LIKE '%_@_%');
ALTER TABLE "UsuarioErp" ADD CONSTRAINT "UsuarioErp_nome_preenchido" CHECK (length(btrim("nome")) >= 2);
ALTER TABLE "PasskeyErp" ADD CONSTRAINT "PasskeyErp_contador_uint32" CHECK ("contador" >= 0 AND "contador" <= 4294967295);
ALTER TABLE "ConviteAcesso" ADD CONSTRAINT "ConviteAcesso_validade" CHECK ("expiraEm" > "criadoEm");
ALTER TABLE "SessaoErp" ADD CONSTRAINT "SessaoErp_validade" CHECK ("expiraEm" > "criadoEm");
ALTER TABLE "DesafioWebauthn" ADD CONSTRAINT "DesafioWebauthn_dono" CHECK (("tipo" = 'REGISTRO') = ("usuarioId" IS NOT NULL));

-- O papel do tenant NÃO alcança credencial nenhuma. Condicional, no padrão da
-- 0.2: só se o papel existir e quem roda for dono das tabelas (que acabou de
-- criar); senão avisa e segue.
DO $$
DECLARE
  tabelas text[] := ARRAY['UsuarioErp', 'AcessoParceiro', 'ConviteAcesso', 'PasskeyErp',
                          'DesafioWebauthn', 'SessaoErp', 'TentativaEntradaErp'];
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    RAISE NOTICE 'ERP 0.3: papel erp_tenant não existe; nada a revogar.';
    RETURN;
  END IF;
  FOREACH t IN ARRAY tabelas LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON %I FROM erp_tenant', t);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'ERP 0.3: % não pôde revogar % de erp_tenant (sem privilégio); o papel não recebeu GRANT nela.', current_user, t;
    END;
  END LOOP;
END $$;
